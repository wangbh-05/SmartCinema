import { err, ok } from '../../shared/Result.js';

export function listVisibleOrders({ stateRepository }, { scope = 'mine' } = {}) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const userId = current.value.session?.userId;
    if (!userId) return err('AUTH_REQUIRED', '请先登录');
    const user = current.value.usersById[userId];
    let orders = Object.values(current.value.ordersById);
    if (!(user.role === 'admin' && scope === 'all')) {
        orders = orders.filter(order => order.userId === userId);
    }
    orders.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return ok(Object.freeze(orders));
}
