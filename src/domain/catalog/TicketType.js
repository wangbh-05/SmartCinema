import { ValidationError } from '../../shared/ValidationError.js';

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

export function createTicketType({
    id,
    label,
    description = '',
    eligibilityNote = '',
    priceAdjustment = 0,
    allowedSeatKinds = []
}) {
    if (!Number.isInteger(priceAdjustment)) {
        throw new ValidationError('TicketType.priceAdjustment 必须是整数分', { priceAdjustment });
    }
    if (!Array.isArray(allowedSeatKinds) || allowedSeatKinds.some(item => typeof item !== 'string')) {
        throw new ValidationError('TicketType.allowedSeatKinds 必须是字符串数组');
    }
    return Object.freeze({
        id: requireText(id, 'TicketType.id'),
        label: requireText(label, 'TicketType.label'),
        description: typeof description === 'string' ? description.trim() : '',
        eligibilityNote: typeof eligibilityNote === 'string' ? eligibilityNote.trim() : '',
        priceAdjustment,
        allowedSeatKinds: Object.freeze([...new Set(allowedSeatKinds)])
    });
}
