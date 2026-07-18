import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { cloneJson, deepFreeze } from '../../shared/objects.js';
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
