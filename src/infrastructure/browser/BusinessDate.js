function datePartsInTimeZone(isoString, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date(isoString));
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function businessDateInTimeZone(isoString, timeZone = 'Asia/Shanghai') {
    const values = datePartsInTimeZone(isoString, timeZone);
    return `${values.year}-${values.month}-${values.day}`;
}

export function nextDate(businessDate) {
    const date = new Date(`${businessDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

export function bookableBusinessDateInTimeZone(
    isoString,
    timeZone = 'Asia/Shanghai',
    finalBookingCloseTime = '22:00'
) {
    const values = datePartsInTimeZone(isoString, timeZone);
    const date = `${values.year}-${values.month}-${values.day}`;
    const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
    const [closeHour, closeMinute] = finalBookingCloseTime.split(':').map(Number);
    return currentMinutes >= closeHour * 60 + closeMinute ? nextDate(date) : date;
}
