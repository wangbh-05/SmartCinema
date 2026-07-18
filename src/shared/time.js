import { ValidationError } from './ValidationError.js';

export function addMilliseconds(isoTimestamp, milliseconds) {
    const timestamp = Date.parse(isoTimestamp);
    if (Number.isNaN(timestamp) || !Number.isFinite(milliseconds)) {
        throw new ValidationError('无法计算无效时间', { isoTimestamp, milliseconds });
    }
    return new Date(timestamp + milliseconds).toISOString();
}
