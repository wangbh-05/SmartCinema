import { releaseSoldSeats } from '../booking/ShowtimeInventory.js';
import { err, ok } from '../../shared/Result.js';
import { cancelCommercialOrder } from './CommercialOrder.js';

export function cancelCommercialBooking({ order, inventory }, cancellation) {
    if (!inventory || inventory.showtimeId !== order.showtimeSnapshot.id) {
        return err('SOLD_INVENTORY_MISMATCH', '订单缺少对应的场次库存');
    }
    const cancelled = cancelCommercialOrder(order, cancellation);
    if (!cancelled.ok) return cancelled;
    const released = releaseSoldSeats(inventory, {
        seatIds: order.seatSnapshots.map(seat => seat.id),
        updatedAt: cancellation.cancelledAt
    });
    if (!released.ok) return released;
    return ok(Object.freeze({
        order: cancelled.value,
        inventory: released.value
    }));
}

export default cancelCommercialBooking;
