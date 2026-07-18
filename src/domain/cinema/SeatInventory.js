import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { parseShowtimeId } from './Showtime.js';
import { parseSeatKey, sortSeatKeys } from './Seat.js';

function validateIsoDate(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${fieldName} 必须是 ISO 时间字符串`, { [fieldName]: value });
    }
}

function validateUniqueSeatKeys(seatKeys, hallType) {
    if (!Array.isArray(seatKeys)) {
        throw new ValidationError('seatKeys 必须是数组');
    }

    const seen = new Set();
    seatKeys.forEach(seatKey => {
        parseSeatKey(seatKey, hallType);
        if (seen.has(seatKey)) {
            throw new ValidationError('seatKeys 不得重复', { seatKey });
        }
        seen.add(seatKey);
    });
    return sortSeatKeys(seatKeys);
}

export function createSeatInventory({
    showtimeId,
    revision = 0,
    soldSeatKeys = [],
    updatedAt
}) {
    const showtime = parseShowtimeId(showtimeId);
    if (!Number.isInteger(revision) || revision < 0) {
        throw new ValidationError('库存 revision 必须是非负整数', { revision });
    }
    validateIsoDate(updatedAt, 'updatedAt');

    return Object.freeze({
        showtimeId,
        revision,
        soldSeatKeys: Object.freeze(validateUniqueSeatKeys(soldSeatKeys, showtime.hallType)),
        updatedAt
    });
}

export function areSeatsAvailable(inventory, seatKeys) {
    const showtime = parseShowtimeId(inventory.showtimeId);
    const requested = validateUniqueSeatKeys(seatKeys, showtime.hallType);
    const sold = new Set(inventory.soldSeatKeys);
    return requested.every(seatKey => !sold.has(seatKey));
}

export function sellSeats(inventory, seatKeys, updatedAt) {
    const showtime = parseShowtimeId(inventory.showtimeId);
    const requested = validateUniqueSeatKeys(seatKeys, showtime.hallType);
    const sold = new Set(inventory.soldSeatKeys);
    const unavailable = requested.filter(seatKey => sold.has(seatKey));

    if (unavailable.length > 0) {
        return err('SEAT_UNAVAILABLE', '部分座位已不可用', { seatKeys: unavailable });
    }

    return ok(createSeatInventory({
        showtimeId: inventory.showtimeId,
        revision: inventory.revision + 1,
        soldSeatKeys: [...inventory.soldSeatKeys, ...requested],
        updatedAt
    }));
}

export function releaseSeats(inventory, seatKeys, updatedAt) {
    const showtime = parseShowtimeId(inventory.showtimeId);
    const requested = validateUniqueSeatKeys(seatKeys, showtime.hallType);
    const releaseSet = new Set(requested);
    const sold = new Set(inventory.soldSeatKeys);
    const missing = requested.filter(seatKey => !sold.has(seatKey));

    if (missing.length > 0) {
        return err('STORAGE_CORRUPTED', '订单座位与库存不一致', { seatKeys: missing });
    }

    return ok(createSeatInventory({
        showtimeId: inventory.showtimeId,
        revision: inventory.revision + 1,
        soldSeatKeys: inventory.soldSeatKeys.filter(seatKey => !releaseSet.has(seatKey)),
        updatedAt
    }));
}
