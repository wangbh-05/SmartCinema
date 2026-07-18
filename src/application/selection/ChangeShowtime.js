import { createAppState } from '../AppState.js';

export function changeShowtime(persistedState, showtimeId, now) {
    return createAppState(persistedState, showtimeId, now);
}
