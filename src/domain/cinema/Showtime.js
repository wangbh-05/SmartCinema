import { ValidationError } from '../../shared/ValidationError.js';
import { getHall, isHallType } from './Hall.js';

const SHOWTIME_ID_PATTERN = /^(small|medium|large):day:([0-6])$/;

export function isDayIndex(value) {
    return Number.isInteger(value) && value >= 0 && value <= 6;
}

export function createShowtimeId(hallType, dayIndex) {
    if (!isHallType(hallType)) {
        throw new ValidationError('无法为无效影厅创建场次', { hallType });
    }
    if (!isDayIndex(dayIndex)) {
        throw new ValidationError('场次日期必须是 0..6 的整数', { dayIndex });
    }
    return `${hallType}:day:${dayIndex}`;
}

export function isShowtimeId(value) {
    return typeof value === 'string' && SHOWTIME_ID_PATTERN.test(value);
}

export function parseShowtimeId(showtimeId) {
    const match = typeof showtimeId === 'string' ? showtimeId.match(SHOWTIME_ID_PATTERN) : null;
    if (!match) {
        throw new ValidationError('无效的场次 ID', { showtimeId });
    }

    const hallType = match[1];
    const dayIndex = Number(match[2]);
    return Object.freeze({
        id: showtimeId,
        hallType,
        dayIndex,
        hall: getHall(hallType)
    });
}

export function createShowtime(hallType, dayIndex) {
    return parseShowtimeId(createShowtimeId(hallType, dayIndex));
}
