import { ValidationError } from '../../shared/ValidationError.js';
import { deepFreeze } from '../../shared/objects.js';

const SEAT_STATUSES = new Set(['available', 'occupied']);

export function createSeatLayoutSnapshot({ rows, cols, seats }) {
    if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0) {
        throw new ValidationError('座位布局 rows/cols 必须是正整数');
    }
    if (!Array.isArray(seats) || seats.length !== rows) {
        throw new ValidationError('座位布局行数不匹配');
    }
    const normalized = seats.map((seatRow, row) => {
        if (!Array.isArray(seatRow) || seatRow.length !== cols) {
            throw new ValidationError('座位布局列数不匹配', { row });
        }
        return seatRow.map((seat, col) => {
            if (!seat || seat.row !== row || seat.col !== col || !SEAT_STATUSES.has(seat.status)) {
                throw new ValidationError('座位布局坐标或状态无效', { row, col });
            }
            if (!Number.isFinite(seat.price) || seat.price < 0) {
                throw new ValidationError('座位价格无效', { row, col });
            }
            return {
                seatKey: `${row}-${col}`,
                row,
                col,
                status: seat.status,
                price: seat.price,
                isSelected: Boolean(seat.isSelected),
                isRemoteHeld: Boolean(seat.isRemoteHeld)
            };
        });
    });
    return deepFreeze({ rows, cols, seats: normalized });
}

export function getLayoutSeat(layout, row, col) {
    if (row < 0 || row >= layout.rows || col < 0 || col >= layout.cols) return null;
    return layout.seats[row][col];
}

export function isLayoutSeatAvailable(layout, row, col) {
    const seat = getLayoutSeat(layout, row, col);
    return Boolean(
        seat &&
        seat.status === 'available' &&
        !seat.isSelected &&
        !seat.isRemoteHeld
    );
}

export function findConsecutiveLayoutSeats(layout, row, count) {
    if (row < 0 || row >= layout.rows || !Number.isInteger(count) || count <= 0) return null;
    let consecutive = [];
    for (let col = 0; col < layout.cols; col++) {
        if (isLayoutSeatAvailable(layout, row, col)) {
            consecutive.push(getLayoutSeat(layout, row, col));
            if (consecutive.length === count) return consecutive;
        } else {
            consecutive = [];
        }
    }
    return null;
}

export function getLayoutHeatIndex(layout, row, col) {
    let occupied = 0;
    let total = 0;
    for (let candidateRow = row - 2; candidateRow <= row + 2; candidateRow++) {
        for (let candidateCol = col - 2; candidateCol <= col + 2; candidateCol++) {
            if (candidateRow === row && candidateCol === col) continue;
            const seat = getLayoutSeat(layout, candidateRow, candidateCol);
            if (!seat) continue;
            total++;
            if (seat.status === 'occupied' || seat.isSelected) occupied++;
        }
    }
    return total === 0 ? 0 : occupied / total;
}

export function getSelectedLayoutSeats(layout) {
    return layout.seats.flat().filter(seat => seat.isSelected);
}

export default createSeatLayoutSnapshot;
