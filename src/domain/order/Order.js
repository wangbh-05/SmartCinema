import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { createSeatKey, parseSeatKey } from '../cinema/Seat.js';
import { parseShowtimeId } from '../cinema/Showtime.js';
import { ORDER_STATUS } from './OrderStatus.js';

function requireOpaqueId(value, fieldName) {
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

export function createOrderSeats(showtimeId, seats) {
    if (!Array.isArray(seats) || seats.length === 0) {
        throw new ValidationError('订单必须至少包含一个座位');
    }
    const showtime = parseShowtimeId(showtimeId);
    const seen = new Set();
    return Object.freeze(seats.map(seat => {
        const seatKey = seat.seatKey || createSeatKey(seat.row, seat.col, showtime.hallType);
        const parsed = parseSeatKey(seatKey, showtime.hallType);
        if (parsed.row !== seat.row || parsed.col !== seat.col) {
            throw new ValidationError('订单 seatKey 与 row/col 不一致', { seatKey });
        }
        if (seen.has(seatKey)) {
            throw new ValidationError('订单座位不得重复', { seatKey });
        }
        if (!Number.isInteger(seat.unitPrice) || seat.unitPrice < 0) {
            throw new ValidationError('unitPrice 必须是非负整数', { unitPrice: seat.unitPrice });
        }
        seen.add(seatKey);
        return Object.freeze({ seatKey, row: parsed.row, col: parsed.col, unitPrice: seat.unitPrice });
    }));
}

export function createConfirmedOrder({
    id,
    idempotencyKey,
    userId,
    showtimeId,
    seats,
    createdAt,
    confirmedAt = createdAt
}) {
    requireOpaqueId(id, 'id');
    requireOpaqueId(idempotencyKey, 'idempotencyKey');
    requireOpaqueId(userId, 'userId');
    parseShowtimeId(showtimeId);
    requireIsoDate(createdAt, 'createdAt');
    requireIsoDate(confirmedAt, 'confirmedAt');
    const normalizedSeats = createOrderSeats(showtimeId, seats);
    const totalPrice = normalizedSeats.reduce((sum, seat) => sum + seat.unitPrice, 0);

    return Object.freeze({
        id,
        idempotencyKey,
        userId,
        showtimeId,
        seats: normalizedSeats,
        totalPrice,
        currency: 'CNY',
        status: ORDER_STATUS.CONFIRMED,
        createdAt,
        confirmedAt,
        cancelledAt: null,
        cancelReason: null,
        refund: null
    });
}

export function cancelOrder(order, { cancelledAt, reason }) {
    if (order.status === ORDER_STATUS.CANCELLED) {
        return err('ORDER_ALREADY_CANCELLED', '订单已经取消', { orderId: order.id });
    }
    if (order.status !== ORDER_STATUS.CONFIRMED) {
        return err('VALIDATION_ERROR', '订单状态不允许取消', { status: order.status });
    }
    requireIsoDate(cancelledAt, 'cancelledAt');

    const next = Object.freeze({
        ...order,
        status: ORDER_STATUS.CANCELLED,
        cancelledAt,
        cancelReason: typeof reason === 'string' ? reason.trim() : '',
        refund: Object.freeze({
            amount: order.totalPrice,
            currency: order.currency,
            status: 'pending'
        })
    });
    return ok(next);
}

export function rehydrateOrder(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ValidationError('订单必须是对象');
    }

    const confirmed = createConfirmedOrder({
        id: data.id,
        idempotencyKey: data.idempotencyKey,
        userId: data.userId,
        showtimeId: data.showtimeId,
        seats: data.seats,
        createdAt: data.createdAt,
        confirmedAt: data.confirmedAt
    });

    if (data.totalPrice !== confirmed.totalPrice || data.currency !== 'CNY') {
        throw new ValidationError('订单金额或币种校验失败', {
            storedTotal: data.totalPrice,
            calculatedTotal: confirmed.totalPrice,
            currency: data.currency
        });
    }

    if (data.status === ORDER_STATUS.CONFIRMED) return confirmed;
    if (data.status === ORDER_STATUS.CANCELLED) {
        const cancelled = cancelOrder(confirmed, {
            cancelledAt: data.cancelledAt,
            reason: data.cancelReason
        });
        if (!cancelled.ok) throw new ValidationError(cancelled.error.message);
        const normalized = cancelled.value;
        if (!data.refund || data.refund.amount !== normalized.refund.amount ||
            data.refund.currency !== normalized.refund.currency || data.refund.status !== normalized.refund.status) {
            throw new ValidationError('取消订单的退款信息无效', { orderId: data.id });
        }
        return normalized;
    }

    throw new ValidationError('订单状态无效', { status: data.status });
}
