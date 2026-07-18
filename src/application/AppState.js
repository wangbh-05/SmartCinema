import { createSeatInventory } from '../domain/cinema/SeatInventory.js';
import { createLocalSelection } from '../domain/cinema/LocalSelection.js';

export function createAppState(persistedState, showtimeId, now) {
    const inventory = persistedState.inventoriesByShowtime[showtimeId] || createSeatInventory({
        showtimeId,
        revision: 0,
        soldSeatKeys: [],
        updatedAt: persistedState.updatedAt
    });
    return Object.freeze({
        revision: persistedState.revision,
        session: persistedState.session,
        showtimeId,
        inventory,
        selection: createLocalSelection({ showtimeId, seatKeys: [], updatedAt: now }),
        remoteHoldsBySeatKey: new Map(),
        recommendation: null,
        systemScore: null,
        manualScore: null,
        combinedScore: null,
        settings: persistedState.settingsByUser[persistedState.session?.userId || 'guest'] ||
            persistedState.settingsByUser.guest
    });
}

export function invalidateSelectionDerivedState(appState, selection) {
    return Object.freeze({
        ...appState,
        selection,
        recommendation: null,
        systemScore: null,
        combinedScore: null
    });
}
