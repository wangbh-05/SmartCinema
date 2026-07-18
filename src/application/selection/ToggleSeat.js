import { toggleSelectedSeat } from '../../domain/cinema/LocalSelection.js';
import { invalidateSelectionDerivedState } from '../AppState.js';

export function toggleSeat(appState, seatKey, now) {
    const result = toggleSelectedSeat(
        appState.selection,
        seatKey,
        appState.inventory,
        appState.remoteHoldsBySeatKey,
        now
    );
    if (!result.ok) return result;
    return { ok: true, value: invalidateSelectionDerivedState(appState, result.value) };
}
