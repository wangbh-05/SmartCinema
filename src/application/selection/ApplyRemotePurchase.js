import { ok } from '../../shared/Result.js';
import { createSeatInventory, sellSeats } from '../../domain/cinema/SeatInventory.js';

export function applyRemotePurchase({ stateRepository, clock }, { showtimeId, seatKey }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const now = clock.now();
    const inventory = current.value.inventoriesByShowtime[showtimeId] || createSeatInventory({
        showtimeId,
        revision: 0,
        soldSeatKeys: [],
        updatedAt: current.value.updatedAt
    });
    if (inventory.soldSeatKeys.includes(seatKey)) {
        return ok({ state: current.value, inventory, duplicate: true });
    }

    const sold = sellSeats(inventory, [seatKey], now);
    if (!sold.ok) return sold;
    const updated = stateRepository.update(current.value.revision, draft => {
        draft.inventoriesByShowtime[showtimeId] = sold.value;
    });
    if (!updated.ok) return updated;
    return ok({ state: updated.value, inventory: sold.value, duplicate: false });
}
