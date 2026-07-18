import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { rehydratePricingQuote } from './PricingQuote.js';

export const SEAT_HOLD_STATUS = Object.freeze({
    PENDING: 'pending',
    HELD: 'held',
    EXPIRED: 'expired',
    RELEASED: 'released',
    CONSUMED: 'consumed'
});

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

function normalizeTicketItems(ticketItems) {
    if (!Array.isArray(ticketItems) || ticketItems.length === 0) {
        throw new ValidationError('SeatHold.ticketItems 必须是非空数组');
    }
    return Object.freeze(ticketItems.map(item => {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new ValidationError('SeatHold ticket quantity 必须是正整数');
        }
        return Object.freeze({
            ticketTypeId: requireText(item.ticketTypeId, 'ticketTypeId'),
            quantity: item.quantity
        });
    }));
}

function normalizeSeatIds(seatIds) {
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
        throw new ValidationError('SeatHold.seatIds 必须是非空数组');
    }
    const normalized = seatIds.map(seatId => requireText(seatId, 'seatId'));
    if (new Set(normalized).size !== normalized.length) {
        throw new ValidationError('SeatHold.seatIds 不得重复');
    }
    return Object.freeze(normalized);
}

export function createPendingSeatHold({
    id,
    idempotencyKey,
    ownerId,
    showtimeId,
    ticketItems,
    seatIds,
    requestedAt,
    expectedInventoryRevision
}) {
    if (!Number.isInteger(expectedInventoryRevision) || expectedInventoryRevision < 0) {
        throw new ValidationError('expectedInventoryRevision 必须是非负整数');
    }
    return Object.freeze({
        id: requireText(id, 'SeatHold.id'),
        idempotencyKey: requireText(idempotencyKey, 'SeatHold.idempotencyKey'),
        ownerId: requireText(ownerId, 'SeatHold.ownerId'),
        showtimeId: requireText(showtimeId, 'SeatHold.showtimeId'),
        ticketItems: normalizeTicketItems(ticketItems),
        seatIds: normalizeSeatIds(seatIds),
        status: SEAT_HOLD_STATUS.PENDING,
        requestedAt: requireIsoDate(requestedAt, 'SeatHold.requestedAt'),
        heldAt: null,
        expiresAt: null,
        terminalAt: null,
        releaseReason: null,
        consumedOrderId: null,
        expectedInventoryRevision,
        inventoryRevision: null,
        pricingQuote: null
    });
}

export function markSeatHoldHeld(hold, {
    heldAt,
    expiresAt,
    inventoryRevision,
    pricingQuote
}) {
    if (hold.status !== SEAT_HOLD_STATUS.PENDING) {
        return err('HOLD_STATE_INVALID', '只有 pending hold 可以进入 held', { status: hold.status });
    }
    try {
        const normalizedHeldAt = requireIsoDate(heldAt, 'heldAt');
        const normalizedExpiresAt = requireIsoDate(expiresAt, 'expiresAt');
        if (Date.parse(normalizedExpiresAt) <= Date.parse(normalizedHeldAt)) {
            throw new ValidationError('expiresAt 必须晚于 heldAt');
        }
        if (!Number.isInteger(inventoryRevision) || inventoryRevision < 0) {
            throw new ValidationError('inventoryRevision 必须是非负整数');
        }
        if (!pricingQuote || typeof pricingQuote !== 'object' || !pricingQuote.total) {
            throw new ValidationError('held 状态必须包含 pricingQuote');
        }
        return ok(Object.freeze({
            ...hold,
            status: SEAT_HOLD_STATUS.HELD,
            heldAt: normalizedHeldAt,
            expiresAt: normalizedExpiresAt,
            inventoryRevision,
            pricingQuote
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}

export function releaseSeatHold(hold, { releasedAt, reason }) {
    if (![SEAT_HOLD_STATUS.PENDING, SEAT_HOLD_STATUS.HELD].includes(hold.status)) {
        return err('HOLD_STATE_INVALID', '当前 hold 状态不能释放', { status: hold.status });
    }
    try {
        return ok(Object.freeze({
            ...hold,
            status: SEAT_HOLD_STATUS.RELEASED,
            terminalAt: requireIsoDate(releasedAt, 'releasedAt'),
            releaseReason: requireText(reason, 'releaseReason')
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}

export function expireSeatHoldState(hold, expiredAt) {
    if (hold.status !== SEAT_HOLD_STATUS.HELD) {
        return err('HOLD_STATE_INVALID', '只有 held 状态可以过期', { status: hold.status });
    }
    try {
        const normalizedExpiredAt = requireIsoDate(expiredAt, 'expiredAt');
        if (Date.parse(normalizedExpiredAt) < Date.parse(hold.expiresAt)) {
            return err('HOLD_NOT_EXPIRED', 'hold 尚未到期', { expiresAt: hold.expiresAt });
        }
        return ok(Object.freeze({
            ...hold,
            status: SEAT_HOLD_STATUS.EXPIRED,
            terminalAt: normalizedExpiredAt,
            releaseReason: 'expired'
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}

export function consumeSeatHoldState(hold, { orderId, consumedAt }) {
    if (hold.status !== SEAT_HOLD_STATUS.HELD) {
        return err('HOLD_STATE_INVALID', '只有 held 状态可以被订单消费', { status: hold.status });
    }
    try {
        const normalizedConsumedAt = requireIsoDate(consumedAt, 'consumedAt');
        if (Date.parse(normalizedConsumedAt) >= Date.parse(hold.expiresAt)) {
            return err('HOLD_EXPIRED', 'hold 已过期', { expiresAt: hold.expiresAt });
        }
        return ok(Object.freeze({
            ...hold,
            status: SEAT_HOLD_STATUS.CONSUMED,
            terminalAt: normalizedConsumedAt,
            consumedOrderId: requireText(orderId, 'orderId')
        }));
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }
}

export function isSeatHoldActive(hold, now) {
    if (hold.status !== SEAT_HOLD_STATUS.HELD) return false;
    requireIsoDate(now, 'now');
    return Date.parse(now) < Date.parse(hold.expiresAt);
}

export function rehydrateSeatHold(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ValidationError('SeatHold 必须是对象');
    }
    const pending = createPendingSeatHold({
        id: data.id,
        idempotencyKey: data.idempotencyKey,
        ownerId: data.ownerId,
        showtimeId: data.showtimeId,
        ticketItems: data.ticketItems,
        seatIds: data.seatIds,
        requestedAt: data.requestedAt,
        expectedInventoryRevision: data.expectedInventoryRevision
    });
    if (data.status === SEAT_HOLD_STATUS.PENDING) return pending;

    let held = null;
    if (data.heldAt !== null && data.heldAt !== undefined) {
        const heldResult = markSeatHoldHeld(pending, {
            heldAt: data.heldAt,
            expiresAt: data.expiresAt,
            inventoryRevision: data.inventoryRevision,
            pricingQuote: rehydratePricingQuote(data.pricingQuote)
        });
        if (!heldResult.ok) throw new ValidationError(heldResult.error.message, heldResult.error.details);
        held = heldResult.value;
    }
    if (data.status === SEAT_HOLD_STATUS.HELD) {
        if (!held) throw new ValidationError('held SeatHold 缺少 held 状态字段');
        return held;
    }
    if (data.status === SEAT_HOLD_STATUS.EXPIRED) {
        if (!held) throw new ValidationError('expired SeatHold 缺少 held 状态字段');
        const expired = expireSeatHoldState(held, data.terminalAt);
        if (!expired.ok) throw new ValidationError(expired.error.message, expired.error.details);
        return expired.value;
    }
    if (data.status === SEAT_HOLD_STATUS.CONSUMED) {
        if (!held) throw new ValidationError('consumed SeatHold 缺少 held 状态字段');
        const consumed = consumeSeatHoldState(held, {
            orderId: data.consumedOrderId,
            consumedAt: data.terminalAt
        });
        if (!consumed.ok) throw new ValidationError(consumed.error.message, consumed.error.details);
        return consumed.value;
    }
    if (data.status === SEAT_HOLD_STATUS.RELEASED) {
        const released = releaseSeatHold(held || pending, {
            releasedAt: data.terminalAt,
            reason: data.releaseReason
        });
        if (!released.ok) throw new ValidationError(released.error.message, released.error.details);
        return released.value;
    }
    throw new ValidationError('SeatHold.status 无效', { status: data.status });
}
