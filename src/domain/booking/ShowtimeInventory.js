import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function requireIsoDate(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${fieldName} 必须是 ISO 时间字符串`, { [fieldName]: value });
    }
    return value;
}

function normalizeSeatIds(seatIds, fieldName) {
    if (!Array.isArray(seatIds)) throw new ValidationError(`${fieldName} 必须是数组`);
    const normalized = seatIds.map(seatId => requireText(seatId, 'seatId'));
    if (new Set(normalized).size !== normalized.length) {
        throw new ValidationError(`${fieldName} 不得重复`);
    }
    return Object.freeze([...normalized].sort());
}

function normalizeHoldMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ValidationError('holdIdsBySeatId 必须是对象');
    }
    const normalized = {};
    Object.entries(value).forEach(([seatId, holdId]) => {
        normalized[requireText(seatId, 'seatId')] = requireText(holdId, 'holdId');
    });
    return Object.freeze(normalized);
}

export function createShowtimeInventory({
    showtimeId,
    revision = 0,
    soldSeatIds = [],
    holdIdsBySeatId = {},
    updatedAt
}) {
    if (!Number.isInteger(revision) || revision < 0) {
        throw new ValidationError('ShowtimeInventory.revision 必须是非负整数');
    }
    const normalizedSold = normalizeSeatIds(soldSeatIds, 'soldSeatIds');
    const normalizedHolds = normalizeHoldMap(holdIdsBySeatId);
    const overlap = normalizedSold.find(seatId => normalizedHolds[seatId]);
    if (overlap) {
        throw new ValidationError('已售座位不得同时被 hold', { seatId: overlap });
    }
    return Object.freeze({
        showtimeId: requireText(showtimeId, 'ShowtimeInventory.showtimeId'),
        revision,
        soldSeatIds: normalizedSold,
        holdIdsBySeatId: normalizedHolds,
        updatedAt: requireIsoDate(updatedAt, 'ShowtimeInventory.updatedAt')
    });
}

export function getUnavailableSeatIds(inventory) {
    return new Set([...inventory.soldSeatIds, ...Object.keys(inventory.holdIdsBySeatId)]);
}

export function reserveSeats(inventory, { holdId, seatIds, updatedAt }) {
    try {
        const normalizedHoldId = requireText(holdId, 'holdId');
        const requested = normalizeSeatIds(seatIds, 'seatIds');
        if (requested.length === 0) return err('VALIDATION_ERROR', 'hold 至少需要一个座位');
        const unavailable = getUnavailableSeatIds(inventory);
        const conflicts = requested.filter(seatId => unavailable.has(seatId));
        if (conflicts.length > 0) {
            return err('SEAT_UNAVAILABLE', '部分座位已不可用', { seatIds: conflicts });
        }
        const nextHolds = { ...inventory.holdIdsBySeatId };
        requested.forEach(seatId => {
            nextHolds[seatId] = normalizedHoldId;
        });
        return ok(createShowtimeInventory({
            ...inventory,
            revision: inventory.revision + 1,
            holdIdsBySeatId: nextHolds,
            updatedAt
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}

export function releaseHeldSeats(inventory, holdId, updatedAt) {
    try {
        const normalizedHoldId = requireText(holdId, 'holdId');
        const nextHolds = {};
        let removed = 0;
        Object.entries(inventory.holdIdsBySeatId).forEach(([seatId, mappedHoldId]) => {
            if (mappedHoldId === normalizedHoldId) removed++;
            else nextHolds[seatId] = mappedHoldId;
        });
        if (removed === 0) return err('HOLD_NOT_FOUND', '库存中不存在对应 hold', { holdId });
        return ok(createShowtimeInventory({
            ...inventory,
            revision: inventory.revision + 1,
            holdIdsBySeatId: nextHolds,
            updatedAt
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}

export function consumeHeldSeats(inventory, { holdId, seatIds, updatedAt }) {
    try {
        const normalizedHoldId = requireText(holdId, 'holdId');
        const requested = normalizeSeatIds(seatIds, 'seatIds');
        const invalid = requested.filter(seatId => inventory.holdIdsBySeatId[seatId] !== normalizedHoldId);
        const mapped = Object.entries(inventory.holdIdsBySeatId)
            .filter(([, mappedHoldId]) => mappedHoldId === normalizedHoldId)
            .map(([seatId]) => seatId)
            .sort();
        if (invalid.length > 0 || JSON.stringify(mapped) !== JSON.stringify([...requested].sort())) {
            return err('HOLD_INVENTORY_MISMATCH', 'hold 与库存座位不一致', {
                holdId,
                requested,
                mapped
            });
        }
        const nextHolds = { ...inventory.holdIdsBySeatId };
        requested.forEach(seatId => delete nextHolds[seatId]);
        return ok(createShowtimeInventory({
            ...inventory,
            revision: inventory.revision + 1,
            soldSeatIds: [...inventory.soldSeatIds, ...requested],
            holdIdsBySeatId: nextHolds,
            updatedAt
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}
