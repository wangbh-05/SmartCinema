import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { getUnavailableSeatIds } from './ShowtimeInventory.js';
import { err, ok } from '../../shared/Result.js';

export const DEFAULT_SEAT_SELECTION_POLICY = Object.freeze({
    maxTicketsPerOrder: 8,
    requireSameSection: true,
    preventOrphanSeat: true,
    companionRequiresWheelchairSpace: true
});

function normalizePolicy(input = {}) {
    const policy = { ...DEFAULT_SEAT_SELECTION_POLICY, ...input };
    if (!Number.isInteger(policy.maxTicketsPerOrder) || policy.maxTicketsPerOrder <= 0) {
        throw new TypeError('maxTicketsPerOrder 必须是正整数');
    }
    ['requireSameSection', 'preventOrphanSeat', 'companionRequiresWheelchairSpace'].forEach(key => {
        if (typeof policy[key] !== 'boolean') throw new TypeError(`${key} 必须是 boolean`);
    });
    return policy;
}

function findOrphanSeats(auditorium, unavailable) {
    const groups = new Map();
    auditorium.seats.forEach(seat => {
        if (seat.kind === 'wheelchair' || seat.kind === 'companion') return;
        const key = `${seat.rowIndex}:${seat.sectionId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(seat);
    });

    const orphanSeatIds = [];
    groups.forEach(seats => {
        const sorted = [...seats].sort((left, right) => left.columnIndex - right.columnIndex);
        for (let index = 1; index < sorted.length - 1; index++) {
            const previous = sorted[index - 1];
            const current = sorted[index];
            const next = sorted[index + 1];
            const structurallyAdjacent = current.columnIndex - previous.columnIndex === 1 &&
                next.columnIndex - current.columnIndex === 1;
            if (structurallyAdjacent && !unavailable.has(current.id) &&
                unavailable.has(previous.id) && unavailable.has(next.id)) {
                orphanSeatIds.push(current.id);
            }
        }
    });
    return orphanSeatIds;
}

export function validateSeatSelection({ draft, auditorium, inventory, policy: inputPolicy = {} }) {
    let policy;
    try {
        policy = normalizePolicy(inputPolicy);
    } catch (error) {
        return err('VALIDATION_ERROR', error.message);
    }
    if (draft.ticketCount > policy.maxTicketsPerOrder) {
        return err('TICKET_LIMIT_EXCEEDED', `单次最多购买 ${policy.maxTicketsPerOrder} 张票`, {
            ticketCount: draft.ticketCount,
            maxTickets: policy.maxTicketsPerOrder
        });
    }
    if (draft.selectedSeatIds.length !== draft.ticketCount) {
        return err('TICKET_COUNT_MISMATCH', '选中座位数必须与票数一致', {
            ticketCount: draft.ticketCount,
            selectedSeatCount: draft.selectedSeatIds.length
        });
    }
    if (inventory.showtimeId !== draft.showtimeId) {
        return err('SHOWTIME_MISMATCH', '草稿与库存场次不一致');
    }

    const selectedSeats = [];
    for (const seatId of draft.selectedSeatIds) {
        const seat = findAuditoriumSeat(auditorium, seatId);
        if (!seat) return err('SEAT_NOT_FOUND', '座位不存在', { seatId });
        selectedSeats.push(seat);
    }
    const unavailable = getUnavailableSeatIds(inventory);
    const conflicts = draft.selectedSeatIds.filter(seatId => unavailable.has(seatId));
    if (conflicts.length > 0) {
        return err('SEAT_UNAVAILABLE', '部分座位已不可用', { seatIds: conflicts });
    }

    if (policy.requireSameSection && new Set(selectedSeats.map(seat => seat.sectionId)).size > 1) {
        return err('CROSS_SECTION_SELECTION', '一次订单的座位必须位于同一影厅区块', {
            sectionIds: [...new Set(selectedSeats.map(seat => seat.sectionId))]
        });
    }

    const accessibleSeats = selectedSeats.filter(seat => seat.kind === 'wheelchair' || seat.kind === 'companion');
    if (accessibleSeats.length > 0 && !draft.accessibilityAcknowledged) {
        return err('ACCESSIBLE_SEAT_ACKNOWLEDGEMENT_REQUIRED', '请选择无障碍席位用途确认', {
            seatIds: accessibleSeats.map(seat => seat.id)
        });
    }

    if (policy.companionRequiresWheelchairSpace) {
        const selectedSet = new Set(draft.selectedSeatIds);
        const invalidCompanions = selectedSeats
            .filter(seat => seat.kind === 'companion' && !selectedSet.has(seat.companionForSeatId))
            .map(seat => seat.id);
        if (invalidCompanions.length > 0) {
            return err('COMPANION_REQUIRES_WHEELCHAIR_SPACE', '陪同席需与对应轮椅位一同选择', {
                seatIds: invalidCompanions
            });
        }
    }

    if (policy.preventOrphanSeat) {
        const afterSelection = new Set([...unavailable, ...draft.selectedSeatIds]);
        const orphanSeatIds = findOrphanSeats(auditorium, afterSelection);
        if (orphanSeatIds.length > 0) {
            return err('ORPHAN_SEAT_CREATED', '当前选择会留下单个孤立空座', { seatIds: orphanSeatIds });
        }
    }

    return ok(Object.freeze({
        seatIds: Object.freeze([...draft.selectedSeatIds]),
        seats: Object.freeze(selectedSeats),
        policy: Object.freeze({ ...policy })
    }));
}
