import {
    addRemoteHold,
    createRemoteHold,
    removeRemoteHold
} from '../../domain/cinema/RemoteHold.js';

export function applyRemoteHold(appState, event, now) {
    let holds;
    if (event.type === 'release') {
        holds = removeRemoteHold(appState.remoteHoldsBySeatKey, event.seatKey);
    } else {
        const hold = createRemoteHold({
            id: event.id,
            showtimeId: appState.showtimeId,
            seatKey: event.seatKey,
            ownerLabel: event.ownerLabel,
            expiresAt: event.expiresAt
        });
        holds = addRemoteHold(appState.remoteHoldsBySeatKey, hold, now);
    }
    return Object.freeze({ ...appState, remoteHoldsBySeatKey: holds });
}
