import { ValidationError } from '../../shared/ValidationError.js';

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

export function createRefundPolicy({
    id,
    refundable,
    cutoffMinutesBeforeShowtime = 0,
    feeAmount = 0,
    currency = 'CNY',
    summary
}) {
    if (typeof refundable !== 'boolean') {
        throw new ValidationError('RefundPolicy.refundable 必须是 boolean');
    }
    if (!Number.isInteger(cutoffMinutesBeforeShowtime) || cutoffMinutesBeforeShowtime < 0) {
        throw new ValidationError('RefundPolicy.cutoffMinutesBeforeShowtime 必须是非负整数');
    }
    if (!Number.isInteger(feeAmount) || feeAmount < 0) {
        throw new ValidationError('RefundPolicy.feeAmount 必须是非负整数分');
    }
    if (!refundable && (cutoffMinutesBeforeShowtime !== 0 || feeAmount !== 0)) {
        throw new ValidationError('不可退政策不得配置退票截止时间或费用');
    }
    return Object.freeze({
        id: requireText(id, 'RefundPolicy.id'),
        refundable,
        cutoffMinutesBeforeShowtime,
        feeAmount,
        currency: requireText(currency, 'RefundPolicy.currency'),
        summary: requireText(summary, 'RefundPolicy.summary')
    });
}
