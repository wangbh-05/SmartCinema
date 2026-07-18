import { ValidationError } from '../../shared/ValidationError.js';

export const SEAT_KINDS = Object.freeze([
    'standard',
    'premium',
    'wheelchair',
    'companion',
    'loveseat'
]);

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function normalizeTextList(value, fieldName) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
        throw new ValidationError(`${fieldName} 必须是非空字符串数组`);
    }
    return Object.freeze([...new Set(value.map(item => item.trim()))]);
}

function createSeatDefinition(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ValidationError('SeatDefinition 必须是对象');
    }
    if (!Number.isInteger(input.rowIndex) || input.rowIndex < 0 ||
        !Number.isInteger(input.columnIndex) || input.columnIndex < 0) {
        throw new ValidationError('SeatDefinition 行列必须是非负整数', {
            rowIndex: input.rowIndex,
            columnIndex: input.columnIndex
        });
    }
    if (!Number.isInteger(input.seatNumber) || input.seatNumber <= 0) {
        throw new ValidationError('SeatDefinition.seatNumber 必须是正整数');
    }
    if (!SEAT_KINDS.includes(input.kind)) {
        throw new ValidationError('SeatDefinition.kind 无效', { kind: input.kind });
    }
    if (input.companionForSeatId !== null && input.companionForSeatId !== undefined &&
        (typeof input.companionForSeatId !== 'string' || input.companionForSeatId.trim().length === 0)) {
        throw new ValidationError('companionForSeatId 必须是非空字符串或 null');
    }

    return Object.freeze({
        id: requireText(input.id, 'SeatDefinition.id'),
        rowIndex: input.rowIndex,
        columnIndex: input.columnIndex,
        rowLabel: requireText(input.rowLabel, 'SeatDefinition.rowLabel'),
        seatNumber: input.seatNumber,
        label: requireText(input.label, 'SeatDefinition.label'),
        sectionId: requireText(input.sectionId, 'SeatDefinition.sectionId'),
        zoneId: requireText(input.zoneId, 'SeatDefinition.zoneId'),
        kind: input.kind,
        companionForSeatId: input.companionForSeatId?.trim() || null,
        stepFree: Boolean(input.stepFree)
    });
}

export function createAuditorium({
    id,
    cinemaId,
    name,
    seats,
    accessibilityFeatures = []
}) {
    if (!Array.isArray(seats) || seats.length === 0) {
        throw new ValidationError('Auditorium.seats 必须是非空数组');
    }
    const seatIds = new Set();
    const positions = new Set();
    const normalizedSeats = seats.map(input => {
        const seat = createSeatDefinition(input);
        const positionKey = `${seat.rowIndex}:${seat.columnIndex}`;
        if (seatIds.has(seat.id)) {
            throw new ValidationError('Auditorium 座位 ID 不得重复', { seatId: seat.id });
        }
        if (positions.has(positionKey)) {
            throw new ValidationError('Auditorium 座位位置不得重复', { positionKey });
        }
        seatIds.add(seat.id);
        positions.add(positionKey);
        return seat;
    });

    normalizedSeats.forEach(seat => {
        if (seat.kind === 'companion') {
            const paired = normalizedSeats.find(candidate => candidate.id === seat.companionForSeatId);
            if (!paired || paired.kind !== 'wheelchair') {
                throw new ValidationError('陪同席必须引用同一影厅的轮椅位', { seatId: seat.id });
            }
        } else if (seat.companionForSeatId !== null) {
            throw new ValidationError('只有陪同席可以设置 companionForSeatId', { seatId: seat.id });
        }
    });

    return Object.freeze({
        id: requireText(id, 'Auditorium.id'),
        cinemaId: requireText(cinemaId, 'Auditorium.cinemaId'),
        name: requireText(name, 'Auditorium.name'),
        seats: Object.freeze(normalizedSeats),
        accessibilityFeatures: normalizeTextList(accessibilityFeatures, 'Auditorium.accessibilityFeatures')
    });
}

export function findAuditoriumSeat(auditorium, seatId) {
    return auditorium.seats.find(seat => seat.id === seatId) || null;
}
