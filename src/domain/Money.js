import { ValidationError } from '../shared/ValidationError.js';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function createMoney(amount, currency = 'CNY') {
    if (!Number.isInteger(amount) || amount < 0) {
        throw new ValidationError('金额必须是非负整数分', { amount });
    }
    if (typeof currency !== 'string' || !CURRENCY_PATTERN.test(currency)) {
        throw new ValidationError('币种必须是三位大写代码', { currency });
    }
    return Object.freeze({ amount, currency });
}

export function addMoney(...values) {
    if (values.length === 0) return createMoney(0);
    const currency = values[0].currency;
    const amount = values.reduce((total, value) => {
        const money = createMoney(value.amount, value.currency);
        if (money.currency !== currency) {
            throw new ValidationError('不同币种金额不能相加', {
                expectedCurrency: currency,
                actualCurrency: money.currency
            });
        }
        return total + money.amount;
    }, 0);
    return createMoney(amount, currency);
}

export function multiplyMoney(value, quantity) {
    const money = createMoney(value.amount, value.currency);
    if (!Number.isInteger(quantity) || quantity < 0) {
        throw new ValidationError('金额数量必须是非负整数', { quantity });
    }
    return createMoney(money.amount * quantity, money.currency);
}

export function cloneMoney(value) {
    return createMoney(value.amount, value.currency);
}
