import { ValidationError } from '../../shared/ValidationError.js';
import { getHall } from './Hall.js';

const SEAT_KEY_PATTERN = /^(0|[1-9]\d*)-(0|[1-9]\d*)$/;

export function createSeatKey(row, col, hallType = null) {
    if (!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0) {
        throw new ValidationError('座位行列必须是非负整数', { row, col });
    }
    if (hallType) validateSeatPosition(row, col, hallType);
    return `${row}-${col}`;
}

export function parseSeatKey(seatKey, hallType = null) {
    const match = typeof seatKey === 'string' ? seatKey.match(SEAT_KEY_PATTERN) : null;
    if (!match) {
        throw new ValidationError('无效的座位 Key', { seatKey });
    }

    const row = Number(match[1]);
    const col = Number(match[2]);
    if (hallType) validateSeatPosition(row, col, hallType);
    return Object.freeze({ seatKey, row, col });
}

export function validateSeatPosition(row, col, hallType) {
    const hall = getHall(hallType);
    if (row >= hall.rows || col >= hall.cols) {
        throw new ValidationError('座位超出影厅范围', { row, col, hallType });
    }
    return true;
}

export function compareSeatKeys(left, right) {
    const a = parseSeatKey(left);
    const b = parseSeatKey(right);
    return a.row - b.row || a.col - b.col;
}

export function sortSeatKeys(seatKeys) {
    return [...seatKeys].sort(compareSeatKeys);
}

export function formatSeatLabel(seatKey) {
    const { row, col } = parseSeatKey(seatKey);
    return `${row + 1}排${col + 1}座`;
}
