import { err, ok } from '../../shared/Result.js';
import { releaseSeats, sellSeats } from '../cinema/SeatInventory.js';
import { cancelOrder } from './Order.js';

export function confirmBooking(inventory, order) {
    if (inventory.showtimeId !== order.showtimeId) {
        return err('VALIDATION_ERROR', '订单与库存场次不一致');
    }
    const sold = sellSeats(
        inventory,
        order.seats.map(seat => seat.seatKey),
        order.confirmedAt
    );
    if (!sold.ok) return sold;
    return ok(Object.freeze({ order, inventory: sold.value }));
}

export function cancelBooking(inventory, order, cancellation) {
    if (inventory.showtimeId !== order.showtimeId) {
        return err('VALIDATION_ERROR', '订单与库存场次不一致');
    }
    const cancelled = cancelOrder(order, cancellation);
    if (!cancelled.ok) return cancelled;
    const released = releaseSeats(
        inventory,
        order.seats.map(seat => seat.seatKey),
        cancellation.cancelledAt
    );
    if (!released.ok) return released;
    return ok(Object.freeze({ order: cancelled.value, inventory: released.value }));
}
