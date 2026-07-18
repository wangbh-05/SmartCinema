export const COMMERCE_TIME_ZONE = 'Asia/Shanghai';

export function formatMoney(money) {
    if (!money) return '—';
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: money.currency,
        minimumFractionDigits: money.amount % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    }).format(money.amount / 100);
}

export function formatAmount(amount, currency = 'CNY') {
    return formatMoney({ amount, currency });
}

export function formatTime(isoString) {
    if (!isoString) return '时间待确认';
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: COMMERCE_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(isoString));
}

export function formatDate(isoString, includeYear = false) {
    if (!isoString) return '日期待确认';
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: COMMERCE_TIME_ZONE,
        year: includeYear ? 'numeric' : undefined,
        month: 'long',
        day: 'numeric',
        weekday: 'short'
    }).format(new Date(isoString));
}

export function appendText(parent, tagName, text, className = '') {
    const child = document.createElement(tagName);
    child.textContent = text;
    if (className) child.className = className;
    parent.append(child);
    return child;
}
