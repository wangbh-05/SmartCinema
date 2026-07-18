import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { createOrderSeats } from './Order.js';
import { parseShowtimeId } from '../cinema/Showtime.js';

export const CHECKOUT_STATE = Object.freeze({
    PENDING: 'pending',
    CONSUMED: 'consumed'
});

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value;
}

function requireIsoDate(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${fieldName} 必须是 ISO 时间字符串`, { [fieldName]: value });
    }
    return value;
}

export function createCheckoutIntent({
    id,
    idempotencyKey = id,
    userId,
    showtimeId,
    seats,
    inventoryRevision,
    createdAt,
    expiresAt,
    state = CHECKOUT_STATE.PENDING,
    consumedOrderId = null
}) {
    requireText(id, 'id');
    requireText(idempotencyKey, 'idempotencyKey');
    requireText(userId, 'userId');
    parseShowtimeId(showtimeId);
    if (!Number.isInteger(inventoryRevision) || inventoryRevision < 0) {
        throw new ValidationError('inventoryRevision 必须是非负整数');
    }
    requireIsoDate(createdAt, 'createdAt');
    requireIsoDate(expiresAt, 'expiresAt');
    if (Date.parse(expiresAt) <= Date.parse(createdAt)) {
        throw new ValidationError('CheckoutIntent expiresAt 必须晚于 createdAt');
    }
    if (!Object.values(CHECKOUT_STATE).includes(state)) {
        throw new ValidationError('CheckoutIntent state 无效', { state });
    }
    if (state === CHECKOUT_STATE.CONSUMED) requireText(consumedOrderId, 'consumedOrderId');
    if (state === CHECKOUT_STATE.PENDING && consumedOrderId !== null) {
        throw new ValidationError('pending CheckoutIntent 不得包含 consumedOrderId');
    }

    const normalizedSeats = createOrderSeats(showtimeId, seats);
    return Object.freeze({
        schemaVersion: 2,
        id,
        idempotencyKey,
        userId,
        showtimeId,
        seats: normalizedSeats,
        totalPrice: normalizedSeats.reduce((sum, seat) => sum + seat.unitPrice, 0),
        inventoryRevision,
        state,
        createdAt,
        expiresAt,
        consumedOrderId
    });
}

export function rehydrateCheckoutIntent(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.schemaVersion !== 2) {
        throw new ValidationError('CheckoutIntent schema 无效');
    }
    const intent = createCheckoutIntent(data);
    if (data.totalPrice !== intent.totalPrice) {
        throw new ValidationError('CheckoutIntent 总价校验失败');
    }
    return intent;
}

export function consumeCheckoutIntent(intent, orderId) {
    if (intent.state === CHECKOUT_STATE.CONSUMED) {
        if (intent.consumedOrderId === orderId) return ok(intent);
        return err('VALIDATION_ERROR', 'CheckoutIntent 已被其他订单消费');
    }
    return ok(createCheckoutIntent({
        ...intent,
        state: CHECKOUT_STATE.CONSUMED,
        consumedOrderId: orderId
    }));
}

export function isCheckoutExpired(intent, now) {
    requireIsoDate(now, 'now');
    return Date.parse(now) >= Date.parse(intent.expiresAt);
}
