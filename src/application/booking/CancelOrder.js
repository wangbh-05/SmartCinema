import { err, ok } from '../../shared/Result.js';
import { cancelBooking } from '../../domain/order/BookingPolicy.js';

export function cancelUserOrder({ stateRepository, clock }, { orderId, reason = '' }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const userId = current.value.session?.userId;
    if (!userId) return err('AUTH_REQUIRED', '请先登录');
    const currentUser = current.value.usersById[userId];
    const order = current.value.ordersById[orderId];
    if (!order) return err('ORDER_NOT_FOUND', '订单不存在');
    if (currentUser.role !== 'admin' && order.userId !== userId) {
        return err('FORBIDDEN', '无权操作该订单');
    }
    const inventory = current.value.inventoriesByShowtime[order.showtimeId];
    if (!inventory) return err('STORAGE_CORRUPTED', '订单对应库存不存在');
    const cancellation = { cancelledAt: clock.now(), reason };
    const cancelled = cancelBooking(inventory, order, cancellation);
    if (!cancelled.ok) return cancelled;

    const updated = stateRepository.update(current.value.revision, draft => {
        draft.ordersById[order.id] = cancelled.value.order;
        draft.inventoriesByShowtime[order.showtimeId] = cancelled.value.inventory;
    });
    if (!updated.ok) return updated;
    return ok({ order: cancelled.value.order, state: updated.value });
}
