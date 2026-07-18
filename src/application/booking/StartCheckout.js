import { err, ok } from '../../shared/Result.js';
import { addMilliseconds } from '../../shared/time.js';
import { areSeatsAvailable, createSeatInventory } from '../../domain/cinema/SeatInventory.js';
import { createCheckoutIntent } from '../../domain/order/CheckoutIntent.js';

export function startCheckout({
    stateRepository,
    checkoutIntentRepository,
    clock,
    idGenerator
}, { showtimeId, seats }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const userId = current.value.session?.userId;
    if (!userId) return err('AUTH_REQUIRED', '请先登录');

    let inventory = current.value.inventoriesByShowtime[showtimeId];
    if (!inventory) {
        try {
            inventory = createSeatInventory({
                showtimeId,
                revision: 0,
                soldSeatKeys: [],
                updatedAt: current.value.updatedAt
            });
        } catch (error) {
            return err('VALIDATION_ERROR', error.message);
        }
    }
    const seatKeys = Array.isArray(seats) ? seats.map(seat => seat.seatKey || `${seat.row}-${seat.col}`) : [];
    try {
        if (!areSeatsAvailable(inventory, seatKeys)) {
            return err('SEAT_UNAVAILABLE', '部分座位已不可用', { seatKeys });
        }
        const now = clock.now();
        const id = idGenerator.next('checkout');
        const intent = createCheckoutIntent({
            id,
            idempotencyKey: id,
            userId,
            showtimeId,
            seats,
            inventoryRevision: inventory.revision,
            createdAt: now,
            expiresAt: addMilliseconds(now, 15 * 60 * 1000)
        });
        const saved = checkoutIntentRepository.save(intent);
        if (!saved.ok) return saved;
        return ok(saved.value);
    } catch (error) {
        return err('VALIDATION_ERROR', error.message);
    }
}
