import { replaceDraftSeats } from '../../domain/booking/BookingDraft.js';
import { PARTY_TYPE_LABELS } from '../../domain/booking/BookingDraft.js';
import { validateSeatSelection } from '../../domain/booking/SeatSelectionPolicy.js';
import { getUnavailableSeatIds } from '../../domain/booking/ShowtimeInventory.js';
import { err, ok } from '../../shared/Result.js';

const PREFERENCE_LABELS = Object.freeze({
    center: '靠中间',
    back: '靠后排',
    aisle: '靠过道',
    'step-free': '无台阶'
});

function groupAvailableSeats(auditorium, unavailable, allowAccessibleSeats) {
    const groups = new Map();
    auditorium.seats.forEach(seat => {
        if (unavailable.has(seat.id)) return;
        if (!allowAccessibleSeats && ['wheelchair', 'companion'].includes(seat.kind)) return;
        const key = `${seat.rowIndex}:${seat.sectionId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(seat);
    });
    return [...groups.values()].map(seats =>
        [...seats].sort((left, right) => left.columnIndex - right.columnIndex)
    );
}

function contiguousWindows(seats, count) {
    const windows = [];
    for (let start = 0; start <= seats.length - count; start++) {
        const candidate = seats.slice(start, start + count);
        const contiguous = candidate.every((seat, index) =>
            index === 0 || seat.columnIndex === candidate[index - 1].columnIndex + 1
        );
        if (contiguous) windows.push(candidate);
    }
    return windows;
}

function audienceConstraints(draft, auditorium) {
    const ticketTypeIds = new Set(draft.ticketItems.map(item => item.ticketTypeId));
    const maxRowIndex = Math.max(...auditorium.seats.map(seat => seat.rowIndex), 0);
    return Object.freeze({
        avoidFrontRows: ticketTypeIds.has('child'),
        avoidBackRows: ticketTypeIds.has('senior'),
        minimumRowIndex: ticketTypeIds.has('child') ? Math.min(3, maxRowIndex) : 0,
        maximumRowIndex: ticketTypeIds.has('senior') ? Math.max(0, maxRowIndex - 3) : maxRowIndex
    });
}

function satisfiesAudienceConstraints(seats, constraints) {
    return seats.every(seat =>
        seat.rowIndex >= constraints.minimumRowIndex &&
        seat.rowIndex <= constraints.maximumRowIndex
    );
}

function scoreCandidate(seats, auditorium, preferences, partyType) {
    const maxRowIndex = Math.max(...auditorium.seats.map(seat => seat.rowIndex), 1);
    const maxColumnIndex = Math.max(...auditorium.seats.map(seat => seat.columnIndex), 1);
    const averageRow = seats.reduce((sum, seat) => sum + seat.rowIndex, 0) / seats.length;
    const averageColumn = seats.reduce((sum, seat) => sum + seat.columnIndex, 0) / seats.length;
    const horizontalCenter = maxColumnIndex / 2;
    const sweetSpotRow = maxRowIndex * 0.58;
    let score = 100;

    score -= Math.abs(averageColumn - horizontalCenter) * 3.2;
    score -= Math.abs(averageRow - sweetSpotRow) * 4.5;
    score += seats.filter(seat => seat.zoneId === 'preferred').length * 2;

    if (preferences.includes('center')) {
        score -= Math.abs(averageColumn - horizontalCenter) * 5;
    }
    if (preferences.includes('back')) {
        score += (averageRow / maxRowIndex) * 18;
    }
    if (preferences.includes('aisle')) {
        const groupColumns = auditorium.seats
            .filter(seat => seat.rowIndex === seats[0].rowIndex && seat.sectionId === seats[0].sectionId)
            .map(seat => seat.columnIndex);
        const leftEdge = Math.min(...groupColumns);
        const rightEdge = Math.max(...groupColumns);
        const edgeDistance = Math.min(
            seats[0].columnIndex - leftEdge,
            rightEdge - seats[seats.length - 1].columnIndex
        );
        score += Math.max(0, 16 - edgeDistance * 5);
    }
    if (preferences.includes('step-free')) {
        score += seats.every(seat => seat.stepFree) ? 36 : -36;
    }
    if (partyType === 'couple') {
        score -= Math.abs(averageColumn - horizontalCenter) * 2.5;
    } else if (partyType === 'family') {
        score -= Math.abs(averageRow - maxRowIndex * 0.62) * 3;
    } else if (partyType === 'group') {
        score += seats.every(seat => seat.rowIndex === seats[0].rowIndex) ? 20 : -40;
        score -= Math.abs(averageColumn - horizontalCenter) * 1.5;
    }
    return score;
}

function recommendationReason(draft, constraints) {
    const parts = [`${PARTY_TYPE_LABELS[draft.partyType]}已安排同排连续座位`];
    if (constraints.avoidFrontRows) parts.push('儿童票已避开前三排');
    if (constraints.avoidBackRows) parts.push('长者票已避开后三排');
    if (draft.preferences.length > 0) {
        parts.push(`同时兼顾${draft.preferences.map(item => PREFERENCE_LABELS[item]).join('、')}`);
    }
    return parts.join('；');
}

export function recommendSeatBlock({ draft, auditorium, inventory, updatedAt = draft.updatedAt, policy = {} }) {
    const unavailable = getUnavailableSeatIds(inventory);
    const constraints = audienceConstraints(draft, auditorium);
    const groups = groupAvailableSeats(
        auditorium,
        unavailable,
        draft.accessibilityAcknowledged
    );
    const candidates = groups
        .flatMap(seats => contiguousWindows(seats, draft.ticketCount))
        .filter(seats => satisfiesAudienceConstraints(seats, constraints))
        .map(seats => ({
            seats,
            score: scoreCandidate(seats, auditorium, draft.preferences, draft.partyType)
        }))
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.seats[0].id.localeCompare(right.seats[0].id);
        });

    for (const candidate of candidates) {
        const selected = replaceDraftSeats(
            draft,
            candidate.seats.map(seat => seat.id),
            updatedAt
        );
        if (!selected.ok) continue;
        const validation = validateSeatSelection({
            draft: selected.value,
            auditorium,
            inventory,
            policy
        });
        if (validation.ok) {
            return ok(Object.freeze({
                draft: selected.value,
                seats: Object.freeze([...candidate.seats]),
                reason: recommendationReason(draft, constraints)
            }));
        }
    }

    return err('NO_CONTIGUOUS_SEATS', `没有找到 ${draft.ticketCount} 个符合规则的连续座位`, {
        ticketCount: draft.ticketCount
    });
}

export default recommendSeatBlock;
