import { err, ok } from '../../shared/Result.js';
import { createSeatInventory } from '../../domain/cinema/SeatInventory.js';
import { isCheckoutExpired } from '../../domain/order/CheckoutIntent.js';
import { confirmBooking } from '../../domain/order/BookingPolicy.js';
import { createConfirmedOrder } from '../../domain/order/Order.js';

function findByIdempotencyKey(state, idempotencyKey) {
    return Object.values(state.ordersById).find(order => order.idempotencyKey === idempotencyKey) || null;
}

export function confirmCheckout({
    stateRepository,
    checkoutIntentRepository,
    clock,
    idGenerator
}) {
    const intentResult = checkoutIntentRepository.get();
    if (!intentResult.ok) return intentResult;
    const intent = intentResult.value;
    const current = stateRepository.read();
    if (!current.ok) return current;

    const userId = current.value.session?.userId;
    if (!userId) return err('AUTH_REQUIRED', '请先登录');
    if (intent.userId !== userId) {
        return err('CHECKOUT_OWNER_MISMATCH', '结算意图不属于当前用户');
    }

    const existing = findByIdempotencyKey(current.value, intent.idempotencyKey);
    if (existing) {
        checkoutIntentRepository.consume(intent.id, existing.id);
        return ok({ order: existing, state: current.value, duplicate: true });
    }
    if (intent.state === 'consumed') {
        return err('STORAGE_CORRUPTED', '已消费的结算意图缺少对应订单');
    }
    const now = clock.now();
    if (isCheckoutExpired(intent, now)) return err('CHECKOUT_EXPIRED', '结算意图已过期');

    const inventory = current.value.inventoriesByShowtime[intent.showtimeId] || createSeatInventory({
        showtimeId: intent.showtimeId,
        revision: 0,
        soldSeatKeys: [],
        updatedAt: current.value.updatedAt
    });
    let order;
    try {
        order = createConfirmedOrder({
            id: idGenerator.next('order'),
            idempotencyKey: intent.idempotencyKey,
            userId,
            showtimeId: intent.showtimeId,
            seats: intent.seats,
            createdAt: now,
            confirmedAt: now
        });
    } catch (error) {
        return err('VALIDATION_ERROR', error.message);
    }
    const booking = confirmBooking(inventory, order);
    if (!booking.ok) return booking;

    const updated = stateRepository.update(current.value.revision, draft => {
        draft.ordersById[order.id] = booking.value.order;
        draft.inventoriesByShowtime[intent.showtimeId] = booking.value.inventory;
    });
    if (!updated.ok) return updated;

    const consumed = checkoutIntentRepository.consume(intent.id, order.id);
    return ok({
        order,
        state: updated.value,
        duplicate: false,
        checkoutPersisted: consumed.ok
    });
}
