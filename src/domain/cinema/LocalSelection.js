import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { parseSeatKey, sortSeatKeys } from './Seat.js';
import { parseShowtimeId } from './Showtime.js';

function validateSelectionSeatKeys(showtimeId, seatKeys) {
    const showtime = parseShowtimeId(showtimeId);
    if (!Array.isArray(seatKeys)) {
        throw new ValidationError('selection seatKeys 必须是数组');
    }
    const unique = new Set(seatKeys);
    if (unique.size !== seatKeys.length) {
        throw new ValidationError('selection seatKeys 不得重复');
    }
    seatKeys.forEach(seatKey => parseSeatKey(seatKey, showtime.hallType));
    return sortSeatKeys(seatKeys);
}

export function createLocalSelection({ showtimeId, seatKeys = [], updatedAt }) {
    if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) {
        throw new ValidationError('selection updatedAt 必须是 ISO 时间字符串', { updatedAt });
    }
    return Object.freeze({
        showtimeId,
        seatKeys: Object.freeze(validateSelectionSeatKeys(showtimeId, seatKeys)),
        updatedAt
    });
}

function isRemoteHeld(remoteHoldsBySeatKey, seatKey) {
    return remoteHoldsBySeatKey instanceof Map && remoteHoldsBySeatKey.has(seatKey);
}

export function toggleSelectedSeat(selection, seatKey, inventory, remoteHoldsBySeatKey, updatedAt) {
    if (selection.showtimeId !== inventory.showtimeId) {
        throw new ValidationError('selection 与 inventory 场次不一致');
    }
    const showtime = parseShowtimeId(selection.showtimeId);
    parseSeatKey(seatKey, showtime.hallType);
    const selected = new Set(selection.seatKeys);

    if (selected.has(seatKey)) {
        selected.delete(seatKey);
        return ok(createLocalSelection({
            showtimeId: selection.showtimeId,
            seatKeys: [...selected],
            updatedAt
        }));
    }

    if (inventory.soldSeatKeys.includes(seatKey) || isRemoteHeld(remoteHoldsBySeatKey, seatKey)) {
        return err('SEAT_UNAVAILABLE', '座位已不可用', { seatKeys: [seatKey] });
    }

    selected.add(seatKey);
    return ok(createLocalSelection({
        showtimeId: selection.showtimeId,
        seatKeys: [...selected],
        updatedAt
    }));
}

export function replaceSelection(selection, seatKeys, inventory, remoteHoldsBySeatKey, updatedAt) {
    if (selection.showtimeId !== inventory.showtimeId) {
        throw new ValidationError('selection 与 inventory 场次不一致');
    }
    const requested = validateSelectionSeatKeys(selection.showtimeId, seatKeys);
    const unavailable = requested.filter(seatKey =>
        inventory.soldSeatKeys.includes(seatKey) || isRemoteHeld(remoteHoldsBySeatKey, seatKey)
    );

    if (unavailable.length > 0) {
        return err('SEAT_UNAVAILABLE', '部分座位已不可用', { seatKeys: unavailable });
    }

    return ok(createLocalSelection({
        showtimeId: selection.showtimeId,
        seatKeys: requested,
        updatedAt
    }));
}

export function clearSelection(selection, updatedAt) {
    return createLocalSelection({
        showtimeId: selection.showtimeId,
        seatKeys: [],
        updatedAt
    });
}
