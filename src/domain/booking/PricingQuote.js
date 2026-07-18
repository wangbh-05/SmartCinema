import { createMoney } from '../Money.js';
import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { err, ok } from '../../shared/Result.js';

export function quoteBooking({
    draft,
    auditorium,
    ticketTypesById,
    pricingPolicy,
    quotedAt,
    discountAmount = 0
}) {
    if (draft.selectedSeatIds.length !== draft.ticketCount) {
        return err('TICKET_COUNT_MISMATCH', '选中座位数必须与票数一致', {
            ticketCount: draft.ticketCount,
            selectedSeatCount: draft.selectedSeatIds.length
        });
    }
    if (typeof quotedAt !== 'string' || Number.isNaN(Date.parse(quotedAt))) {
        return err('VALIDATION_ERROR', 'quotedAt 必须是 ISO 时间字符串');
    }
    if (!Number.isInteger(discountAmount) || discountAmount < 0) {
        return err('VALIDATION_ERROR', 'discountAmount 必须是非负整数分');
    }

    const ticketLines = [];
    let ticketSubtotalAmount = 0;
    for (const item of draft.ticketItems) {
        const ticketType = ticketTypesById[item.ticketTypeId];
        if (!ticketType) {
            return err('TICKET_TYPE_NOT_FOUND', '票种已不可用', { ticketTypeId: item.ticketTypeId });
        }
        const unitAmount = pricingPolicy.baseTicketPrice + ticketType.priceAdjustment;
        if (!Number.isInteger(unitAmount) || unitAmount < 0) {
            return err('PRICING_INVALID', '票种调整后价格无效', { ticketTypeId: item.ticketTypeId });
        }
        const lineAmount = unitAmount * item.quantity;
        ticketSubtotalAmount += lineAmount;
        ticketLines.push(Object.freeze({
            ticketTypeId: ticketType.id,
            label: ticketType.label,
            quantity: item.quantity,
            unitPrice: createMoney(unitAmount, pricingPolicy.currency),
            amount: createMoney(lineAmount, pricingPolicy.currency),
            eligibilityNote: ticketType.eligibilityNote
        }));
    }

    const seatLines = [];
    let seatSurchargeAmount = 0;
    for (const seatId of draft.selectedSeatIds) {
        const seat = findAuditoriumSeat(auditorium, seatId);
        if (!seat) return err('SEAT_NOT_FOUND', '座位不存在', { seatId });
        const surcharge = pricingPolicy.seatZoneSurcharges[seat.zoneId];
        if (!Number.isInteger(surcharge) || surcharge < 0) {
            return err('PRICING_INVALID', '座位价格区未配置', { seatId, zoneId: seat.zoneId });
        }
        seatSurchargeAmount += surcharge;
        seatLines.push(Object.freeze({
            seatId,
            label: seat.label,
            zoneId: seat.zoneId,
            amount: createMoney(surcharge, pricingPolicy.currency)
        }));
    }

    const serviceFeeAmount = pricingPolicy.serviceFeePerTicket * draft.ticketCount;
    const beforeDiscount = ticketSubtotalAmount + seatSurchargeAmount + serviceFeeAmount;
    if (discountAmount > beforeDiscount) {
        return err('PRICING_INVALID', '优惠金额不得超过应付金额');
    }
    const totalAmount = beforeDiscount - discountAmount;

    return ok(Object.freeze({
        pricingPolicyId: pricingPolicy.id,
        currency: pricingPolicy.currency,
        ticketLines: Object.freeze(ticketLines),
        seatLines: Object.freeze(seatLines),
        ticketSubtotal: createMoney(ticketSubtotalAmount, pricingPolicy.currency),
        seatSurcharge: createMoney(seatSurchargeAmount, pricingPolicy.currency),
        serviceFee: createMoney(serviceFeeAmount, pricingPolicy.currency),
        discount: createMoney(discountAmount, pricingPolicy.currency),
        total: createMoney(totalAmount, pricingPolicy.currency),
        quotedAt
    }));
}
