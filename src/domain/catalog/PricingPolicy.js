import { ValidationError } from '../../shared/ValidationError.js';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function requireNonNegativeInteger(value, fieldName) {
    if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError(`${fieldName} 必须是非负整数分`, { [fieldName]: value });
    }
    return value;
}

export function createPricingPolicy({
    id,
    currency = 'CNY',
    baseTicketPrice,
    serviceFeePerTicket = 0,
    seatZoneSurcharges = {}
}) {
    if (!CURRENCY_PATTERN.test(currency)) {
        throw new ValidationError('PricingPolicy.currency 必须是三位大写代码', { currency });
    }
    if (!seatZoneSurcharges || typeof seatZoneSurcharges !== 'object' || Array.isArray(seatZoneSurcharges)) {
        throw new ValidationError('PricingPolicy.seatZoneSurcharges 必须是对象');
    }
    const normalizedSurcharges = {};
    Object.entries(seatZoneSurcharges).forEach(([zoneId, amount]) => {
        normalizedSurcharges[requireText(zoneId, 'zoneId')] = requireNonNegativeInteger(amount, `zone ${zoneId}`);
    });

    return Object.freeze({
        id: requireText(id, 'PricingPolicy.id'),
        currency,
        baseTicketPrice: requireNonNegativeInteger(baseTicketPrice, 'PricingPolicy.baseTicketPrice'),
        serviceFeePerTicket: requireNonNegativeInteger(serviceFeePerTicket, 'PricingPolicy.serviceFeePerTicket'),
        seatZoneSurcharges: Object.freeze(normalizedSurcharges)
    });
}
