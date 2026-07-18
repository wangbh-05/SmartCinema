import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { cloneJson, deepFreeze } from '../../shared/objects.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { createMoney } from '../Money.js';
import { rehydratePricingQuote } from '../booking/PricingQuote.js';

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

export function createCommercialOrder({
    id,
    idempotencyKey,
    userId,
    hold,
    movie,
    cinema,
    auditorium,
    showtime,
    refundPolicy,
    ticketCode,
    qrPayload,
    confirmedAt
}) {
    if (hold.status !== 'consumed') {
        throw new ValidationError('订单只能从 consumed hold 创建', { holdStatus: hold.status });
    }
    if (hold.consumedOrderId !== id) {
        throw new ValidationError('hold.consumedOrderId 与订单 ID 不一致');
    }
    if (hold.idempotencyKey !== idempotencyKey) {
        throw new ValidationError('hold.idempotencyKey 与订单不一致');
    }
    if (hold.showtimeId !== showtime.id || showtime.movieId !== movie.id ||
        showtime.cinemaId !== cinema.id || showtime.auditoriumId !== auditorium.id) {
        throw new ValidationError('订单目录快照关联不一致');
    }

    const seatSnapshots = hold.seatIds.map(seatId => {
        const seat = findAuditoriumSeat(auditorium, seatId);
        if (!seat) throw new ValidationError('订单座位不在影厅中', { seatId });
        return {
            id: seat.id,
            label: seat.label,
            rowLabel: seat.rowLabel,
            seatNumber: seat.seatNumber,
            sectionId: seat.sectionId,
            zoneId: seat.zoneId,
            kind: seat.kind,
            stepFree: seat.stepFree
        };
    });

    const order = {
        schemaVersion: 3,
        id: requireText(id, 'CommercialOrder.id'),
        idempotencyKey: requireText(idempotencyKey, 'CommercialOrder.idempotencyKey'),
        userId: requireText(userId, 'CommercialOrder.userId'),
        sourceHoldId: hold.id,
        legacySource: null,
        status: 'confirmed',
        movieSnapshot: {
            id: movie.id,
            title: movie.title,
            originalTitle: movie.originalTitle,
            durationMinutes: movie.durationMinutes,
            audienceRating: movie.audienceRating
        },
        cinemaSnapshot: {
            id: cinema.id,
            name: cinema.name,
            city: cinema.city,
            address: cinema.address
        },
        auditoriumSnapshot: {
            id: auditorium.id,
            name: auditorium.name
        },
        showtimeSnapshot: {
            id: showtime.id,
            startsAt: showtime.startsAt,
            endsAt: showtime.endsAt,
            format: showtime.format,
            language: showtime.language,
            subtitle: showtime.subtitle,
            accessibilityFeatures: [...showtime.accessibilityFeatures]
        },
        ticketItems: hold.pricingQuote.ticketLines.map(line => ({
            ticketTypeId: line.ticketTypeId,
            label: line.label,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            eligibilityNote: line.eligibilityNote
        })),
        seatSnapshots,
        pricingQuote: hold.pricingQuote,
        refundPolicySnapshot: cloneJson(refundPolicy),
        ticketCode: requireText(ticketCode, 'CommercialOrder.ticketCode'),
        qrPayload: requireText(qrPayload, 'CommercialOrder.qrPayload'),
        confirmedAt: requireIsoDate(confirmedAt, 'CommercialOrder.confirmedAt'),
        cancelledAt: null,
        refund: null
    };
    return deepFreeze(order);
}

function requireObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ValidationError(`${fieldName} 必须是对象`);
    }
    return value;
}

function rehydrateRefundPolicySnapshot(value) {
    requireObject(value, 'refundPolicySnapshot');
    if (value.refundable === null) {
        if (value.cutoffMinutesBeforeShowtime !== null || value.feeAmount !== null) {
            throw new ValidationError('未知退改政策不得包含推测的截止时间或费用');
        }
        return cloneJson(value);
    }
    if (typeof value.refundable !== 'boolean') {
        throw new ValidationError('refundPolicySnapshot.refundable 必须是 boolean 或 null');
    }
    if (!Number.isInteger(value.cutoffMinutesBeforeShowtime) || value.cutoffMinutesBeforeShowtime < 0 ||
        !Number.isInteger(value.feeAmount) || value.feeAmount < 0) {
        throw new ValidationError('refundPolicySnapshot 金额或截止时间无效');
    }
    return cloneJson(value);
}

export function rehydrateCommercialOrder(data) {
    requireObject(data, 'CommercialOrder');
    if (data.schemaVersion !== 3) throw new ValidationError('CommercialOrder.schemaVersion 必须为 3');
    if (!['confirmed', 'cancelled'].includes(data.status)) {
        throw new ValidationError('CommercialOrder.status 无效', { status: data.status });
    }
    const legacySource = data.legacySource === null ? null : requireObject(data.legacySource, 'legacySource');
    if (legacySource === null) requireText(data.sourceHoldId, 'CommercialOrder.sourceHoldId');
    const movieSnapshot = cloneJson(requireObject(data.movieSnapshot, 'movieSnapshot'));
    const cinemaSnapshot = cloneJson(requireObject(data.cinemaSnapshot, 'cinemaSnapshot'));
    const auditoriumSnapshot = cloneJson(requireObject(data.auditoriumSnapshot, 'auditoriumSnapshot'));
    const showtimeSnapshot = cloneJson(requireObject(data.showtimeSnapshot, 'showtimeSnapshot'));
    requireText(movieSnapshot.id, 'movieSnapshot.id');
    requireText(movieSnapshot.title, 'movieSnapshot.title');
    requireText(cinemaSnapshot.id, 'cinemaSnapshot.id');
    requireText(cinemaSnapshot.name, 'cinemaSnapshot.name');
    requireText(auditoriumSnapshot.id, 'auditoriumSnapshot.id');
    requireText(auditoriumSnapshot.name, 'auditoriumSnapshot.name');
    requireText(showtimeSnapshot.id, 'showtimeSnapshot.id');

    if (!Array.isArray(data.ticketItems) || data.ticketItems.length === 0) {
        throw new ValidationError('CommercialOrder.ticketItems 必须是非空数组');
    }
    if (!Array.isArray(data.seatSnapshots) || data.seatSnapshots.length === 0) {
        throw new ValidationError('CommercialOrder.seatSnapshots 必须是非空数组');
    }
    const seatIds = new Set();
    const seatSnapshots = data.seatSnapshots.map(seat => {
        requireObject(seat, 'seatSnapshot');
        const id = requireText(seat.id, 'seatSnapshot.id');
        if (seatIds.has(id)) throw new ValidationError('CommercialOrder 座位不得重复', { seatId: id });
        seatIds.add(id);
        return cloneJson(seat);
    });
    const pricingQuote = rehydratePricingQuote(data.pricingQuote);
    const confirmedAt = requireIsoDate(data.confirmedAt, 'CommercialOrder.confirmedAt');
    let cancelledAt = null;
    let refund = null;
    if (data.status === 'cancelled') {
        cancelledAt = requireIsoDate(data.cancelledAt, 'CommercialOrder.cancelledAt');
        requireObject(data.refund, 'CommercialOrder.refund');
        refund = {
            ...cloneJson(data.refund),
            amount: createMoney(data.refund.amount.amount, data.refund.amount.currency)
        };
        if (refund.amount.currency !== pricingQuote.currency || refund.amount.amount > pricingQuote.total.amount) {
            throw new ValidationError('CommercialOrder.refund 金额无效');
        }
    } else if (data.cancelledAt !== null || data.refund !== null) {
        throw new ValidationError('confirmed 订单不得包含取消或退款信息');
    }

    return deepFreeze({
        schemaVersion: 3,
        id: requireText(data.id, 'CommercialOrder.id'),
        idempotencyKey: requireText(data.idempotencyKey, 'CommercialOrder.idempotencyKey'),
        userId: requireText(data.userId, 'CommercialOrder.userId'),
        sourceHoldId: data.sourceHoldId === null ? null : requireText(data.sourceHoldId, 'sourceHoldId'),
        legacySource: legacySource === null ? null : cloneJson(legacySource),
        status: data.status,
        movieSnapshot,
        cinemaSnapshot,
        auditoriumSnapshot,
        showtimeSnapshot,
        ticketItems: cloneJson(data.ticketItems),
        seatSnapshots,
        pricingQuote,
        refundPolicySnapshot: rehydrateRefundPolicySnapshot(data.refundPolicySnapshot),
        ticketCode: requireText(data.ticketCode, 'CommercialOrder.ticketCode'),
        qrPayload: requireText(data.qrPayload, 'CommercialOrder.qrPayload'),
        confirmedAt,
        cancelledAt,
        refund
    });
}
