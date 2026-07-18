import { ValidationError } from '../../shared/ValidationError.js';

export const HALL_TYPES = Object.freeze(['small', 'medium', 'large']);

export const HALL_CATALOG = Object.freeze({
    small: Object.freeze({ type: 'small', name: '小厅', rows: 10, cols: 10, total: 100, desc: '10排×10座' }),
    medium: Object.freeze({ type: 'medium', name: '中厅', rows: 10, cols: 20, total: 200, desc: '10排×20座' }),
    large: Object.freeze({ type: 'large', name: '大厅', rows: 10, cols: 30, total: 300, desc: '10排×30座' })
});

export function isHallType(value) {
    return HALL_TYPES.includes(value);
}

export function getHall(hallType) {
    if (!isHallType(hallType)) {
        throw new ValidationError('无效的放映厅类型', { hallType });
    }
    return HALL_CATALOG[hallType];
}
