import { createMoney } from '../Money.js';
import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';

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

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function rehydrateMoney(value, currency, fieldName) {
    if (!value || value.currency !== currency) {
        throw new ValidationError(`${fieldName} 币种无效`);
    }
    return createMoney(value.amount, value.currency);
}

export function rehydratePricingQuote(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ValidationError('PricingQuote 必须是对象');
    }
    const currency = requireText(data.currency, 'PricingQuote.currency');
    if (!Array.isArray(data.ticketLines) || data.ticketLines.length === 0) {
        throw new ValidationError('PricingQuote.ticketLines 必须是非空数组');
    }
    if (!Array.isArray(data.seatLines)) {
        throw new ValidationError('PricingQuote.seatLines 必须是数组');
    }
    const ticketLines = data.ticketLines.map(line => {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
            throw new ValidationError('PricingQuote ticket quantity 无效');
        }
        const unitPrice = rehydrateMoney(line.unitPrice, currency, 'ticket unitPrice');
        const amount = rehydrateMoney(line.amount, currency, 'ticket amount');
        if (amount.amount !== unitPrice.amount * line.quantity) {
            throw new ValidationError('PricingQuote ticket line 金额不一致');
        }
        return Object.freeze({
            ticketTypeId: requireText(line.ticketTypeId, 'ticketTypeId'),
            label: requireText(line.label, 'ticket label'),
            quantity: line.quantity,
            unitPrice,
            amount,
            eligibilityNote: typeof line.eligibilityNote === 'string' ? line.eligibilityNote.trim() : ''
        });
    });
    const seatLines = data.seatLines.map(line => Object.freeze({
        seatId: requireText(line.seatId, 'seatId'),
        label: requireText(line.label, 'seat label'),
        zoneId: requireText(line.zoneId, 'zoneId'),
        amount: rehydrateMoney(line.amount, currency, 'seat amount')
    }));
    const ticketSubtotal = rehydrateMoney(data.ticketSubtotal, currency, 'ticketSubtotal');
    const seatSurcharge = rehydrateMoney(data.seatSurcharge, currency, 'seatSurcharge');
    const serviceFee = rehydrateMoney(data.serviceFee, currency, 'serviceFee');
    const discount = rehydrateMoney(data.discount, currency, 'discount');
    const total = rehydrateMoney(data.total, currency, 'total');
    const calculatedTicketSubtotal = ticketLines.reduce((sum, line) => sum + line.amount.amount, 0);
    const calculatedSeatSurcharge = seatLines.reduce((sum, line) => sum + line.amount.amount, 0);
    if (ticketSubtotal.amount !== calculatedTicketSubtotal ||
        seatSurcharge.amount !== calculatedSeatSurcharge ||
        total.amount !== ticketSubtotal.amount + seatSurcharge.amount + serviceFee.amount - discount.amount) {
        throw new ValidationError('PricingQuote 总价校验失败');
    }
    if (typeof data.quotedAt !== 'string' || Number.isNaN(Date.parse(data.quotedAt))) {
        throw new ValidationError('PricingQuote.quotedAt 必须是 ISO 时间字符串');
    }
    return Object.freeze({
        pricingPolicyId: requireText(data.pricingPolicyId, 'pricingPolicyId'),
        currency,
        ticketLines: Object.freeze(ticketLines),
        seatLines: Object.freeze(seatLines),
        ticketSubtotal,
        seatSurcharge,
        serviceFee,
        discount,
        total,
        quotedAt: data.quotedAt
    });
}
