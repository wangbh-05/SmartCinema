import { createSeatLayoutSnapshot } from '../../application/cinema/SeatLayoutSnapshot.js';

export function snapshotSeatData(seatData) {
    return createSeatLayoutSnapshot({
        rows: seatData.rows,
        cols: seatData.cols,
        seats: seatData.seats.map(row => row.map(seat => ({
            row: seat.row,
            col: seat.col,
            status: seat.status,
            price: seat.price,
            isSelected: seat.isSelected,
            isRemoteHeld: seat.isRemoteHeld
        })))
    });
}

export default snapshotSeatData;
