import { createShowtimeInventory } from '../../domain/booking/ShowtimeInventory.js';
import { err, ok } from '../../shared/Result.js';

function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function createDemoSoldSeatIds(showtime, auditorium) {
    return auditorium.seats
        .filter(seat => !['wheelchair', 'companion'].includes(seat.kind))
        .filter(seat => stableHash(`${showtime.id}:${seat.id}`) % 100 < 22)
        .map(seat => seat.id)
        .sort();
}

export function ensureDemoInventories({ stateRepository, catalogRepository, clock }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const missing = catalogRepository.listShowtimes()
        .filter(showtime => !current.value.inventoriesByShowtime[showtime.id]);
    if (missing.length === 0) return ok({ state: current.value, created: 0 });

    const now = clock.now();
    const prepared = [];
    for (const showtime of missing) {
        const auditorium = catalogRepository.getAuditorium(showtime.auditoriumId);
        if (!auditorium) return err('CATALOG_INCOMPLETE', '无法为场次初始化演示库存');
        prepared.push(createShowtimeInventory({
            showtimeId: showtime.id,
            soldSeatIds: createDemoSoldSeatIds(showtime, auditorium),
            updatedAt: now
        }));
    }

    const persisted = stateRepository.update(current.value.revision, state => {
        prepared.forEach(inventory => {
            state.inventoriesByShowtime[inventory.showtimeId] = inventory;
        });
    });
    if (!persisted.ok) return persisted;
    return ok({ state: persisted.value, created: prepared.length });
}
