import { SEAT_STATUS } from '../../core/SeatData.js';

/**
 * Projects the canonical AppState into the mutable SeatData view model used by Canvas.
 */
export class SeatDataProjection {
    constructor({ seatData, getState, replaceSelection }) {
        this.seatData = seatData;
        this.getState = getState;
        this.replaceSelection = replaceSelection;
    }

    projectPersistedState() {
        const state = this.getState();
        this._clearRemoteHolds();
        this._projectInventory(state.inventory.soldSeatKeys);
        this.restoreSelection(state.selection.seatKeys);
        this.projectRemoteHolds(state.remoteHoldsBySeatKey);
    }

    restoreSelection(seatKeys = this.getState().selection.seatKeys) {
        this.seatData.clearSelection();
        seatKeys.forEach(seatKey => {
            const { row, col } = this._parseSeatKey(seatKey);
            if (this.seatData.isSeatAvailable(row, col)) {
                this.seatData.selectSeat(row, col);
            }
        });
    }

    projectRemoteHolds(remoteHolds = this.getState().remoteHoldsBySeatKey) {
        this._clearRemoteHolds();
        remoteHolds.forEach((hold, seatKey) => {
            const { row, col } = this._parseSeatKey(seatKey);
            const seat = this.seatData.getSeat(row, col);
            if (seat && seat.status === SEAT_STATUS.AVAILABLE && !seat.isSelected) {
                seat.isRemoteHeld = true;
            }
        });
    }

    syncSelection() {
        const seatKeys = this.seatData.getSelectedSeats().map(seat => `${seat.row}-${seat.col}`);
        return this.replaceSelection(seatKeys);
    }

    availableSeatKeys() {
        const seatKeys = [];
        this._forEachSeat(seat => {
            if (this.seatData.isSeatAvailable(seat.row, seat.col)) {
                seatKeys.push(`${seat.row}-${seat.col}`);
            }
        });
        return seatKeys;
    }

    _projectInventory(soldSeatKeys) {
        soldSeatKeys.forEach(seatKey => {
            const { row, col } = this._parseSeatKey(seatKey);
            const seat = this.seatData.getSeat(row, col);
            if (!seat) {
                return;
            }
            seat.status = SEAT_STATUS.OCCUPIED;
            seat.isSelected = false;
            this.seatData.selectedSeats.delete(seatKey);
        });
    }

    _clearRemoteHolds() {
        this._forEachSeat(seat => {
            seat.isRemoteHeld = false;
        });
    }

    _forEachSeat(callback) {
        for (let row = 0; row < this.seatData.rows; row++) {
            for (let col = 0; col < this.seatData.cols; col++) {
                callback(this.seatData.getSeat(row, col));
            }
        }
    }

    _parseSeatKey(seatKey) {
        const [row, col] = seatKey.split('-').map(Number);
        return { row, col };
    }
}

export default SeatDataProjection;
