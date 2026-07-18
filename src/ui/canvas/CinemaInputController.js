import { SEAT_STATUS } from '../../core/SeatData.js';
import { hitTestCinemaSeat } from './CinemaLayout.js';

export class CinemaInputController {
    constructor({
        canvas,
        getLayout,
        getSeatData,
        onVisualChange,
        onSelectionChange,
        onSeatActivated
    }) {
        if (!canvas || typeof getLayout !== 'function' || typeof getSeatData !== 'function') {
            throw new TypeError('CinemaInputController 缺少必要依赖');
        }
        this.canvas = canvas;
        this.getLayout = getLayout;
        this.getSeatData = getSeatData;
        this.onVisualChange = onVisualChange;
        this.onSelectionChange = onSelectionChange;
        this.onSeatActivated = onSeatActivated;
        this.state = {
            dragStart: null,
            dragEnd: null,
            isDragging: false,
            hover: null,
            tooltip: null,
            focus: { row: 0, col: 0 },
            pointerId: null
        };
        this.bound = false;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        this.canvas.addEventListener('pointerdown', event => this.handlePointerDown(event));
        this.canvas.addEventListener('pointermove', event => this.handlePointerMove(event));
        this.canvas.addEventListener('pointerup', event => this.handlePointerUp(event));
        this.canvas.addEventListener('pointercancel', event => this.handlePointerCancel(event));
        this.canvas.addEventListener('pointerleave', event => this.handlePointerLeave(event));
        this.canvas.addEventListener('keydown', event => this.handleKeyDown(event));
    }

    clampFocus() {
        const seatData = this.getSeatData();
        this.state.focus = {
            row: Math.min(this.state.focus.row, seatData.rows - 1),
            col: Math.min(this.state.focus.col, seatData.cols - 1)
        };
        this.state.hover = null;
        this.state.tooltip = null;
    }

    handlePointerDown(event) {
        if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
        const seat = this._seatFromEvent(event);
        if (!seat) return;
        event.preventDefault?.();
        this.state.pointerId = event.pointerId ?? 1;
        this.state.dragStart = seat;
        this.state.dragEnd = seat;
        this.state.isDragging = false;
        this.canvas.setPointerCapture?.(this.state.pointerId);
    }

    handlePointerMove(event) {
        if (event.isPrimary === false) return;
        const seat = this._seatFromEvent(event);
        if (this.state.pointerId !== null && event.pointerId === this.state.pointerId) {
            if (seat && !sameSeat(seat, this.state.dragStart)) {
                this.state.isDragging = true;
                this.state.dragEnd = seat;
            }
            this.state.hover = seat;
            this.state.tooltip = seat;
            this.canvas.style.cursor = seat ? 'pointer' : 'default';
            this.onVisualChange?.();
            return;
        }
        if (sameSeat(seat, this.state.hover)) return;
        this.state.hover = seat;
        this.state.tooltip = seat;
        this.canvas.style.cursor = seat ? 'pointer' : 'default';
        this.onVisualChange?.();
    }

    handlePointerUp(event) {
        if (this.state.pointerId === null || event.pointerId !== this.state.pointerId) return;
        event.preventDefault?.();
        const releaseSeat = this._seatFromEvent(event);
        let changed = false;
        if (this.state.isDragging && this.state.dragStart && this.state.dragEnd) {
            changed = this._selectRectangle(this.state.dragStart, this.state.dragEnd);
        } else if (releaseSeat && sameSeat(releaseSeat, this.state.dragStart)) {
            changed = this._toggleSeat(releaseSeat);
        }
        this._releasePointer(event.pointerId);
        if (changed) this.onSelectionChange?.();
        this.onVisualChange?.();
    }

    handlePointerCancel(event) {
        if (this.state.pointerId !== null && event.pointerId !== this.state.pointerId) return;
        this._releasePointer(event.pointerId);
        this.onVisualChange?.();
    }

    handlePointerLeave(event) {
        if (this.state.pointerId !== null && event.pointerId === this.state.pointerId) {
            this.state.hover = null;
            this.state.tooltip = null;
            this.onVisualChange?.();
            return;
        }
        this.state.hover = null;
        this.state.tooltip = null;
        this.canvas.style.cursor = 'default';
        this.onVisualChange?.();
    }

    handleKeyDown(event) {
        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const seatData = this.getSeatData();
        let { row, col } = this.state.focus;
        if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
        else if (event.key === 'ArrowDown') row = Math.min(seatData.rows - 1, row + 1);
        else if (event.key === 'ArrowLeft') col = Math.max(0, col - 1);
        else if (event.key === 'ArrowRight') col = Math.min(seatData.cols - 1, col + 1);
        else if (this._toggleSeat({ row, col })) this.onSelectionChange?.();
        this.state.focus = { row, col };
        this.state.hover = { row, col };
        this.state.tooltip = { row, col };
        this.onVisualChange?.();
    }

    _seatFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const layout = this.getLayout();
        if (!rect.width || !rect.height) return null;
        return hitTestCinemaSeat(layout, {
            x: (event.clientX - rect.left) * (layout.displayWidth / rect.width),
            y: (event.clientY - rect.top) * (layout.displayHeight / rect.height)
        });
    }

    _toggleSeat(position) {
        const seatData = this.getSeatData();
        const seat = seatData.getSeat(position.row, position.col);
        if (!seat || seat.status === SEAT_STATUS.OCCUPIED || seat.isRemoteHeld) return false;
        const changed = seat.isSelected ?
            seatData.deselectSeat(position.row, position.col) :
            seatData.selectSeat(position.row, position.col);
        if (changed) this.onSeatActivated?.(position.row, position.col);
        return changed;
    }

    _selectRectangle(start, end) {
        const seatData = this.getSeatData();
        const startRow = Math.min(start.row, end.row);
        const endRow = Math.max(start.row, end.row);
        const startCol = Math.min(start.col, end.col);
        const endCol = Math.max(start.col, end.col);
        let changed = false;
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const seat = seatData.getSeat(row, col);
                if (
                    seat &&
                    seat.status === SEAT_STATUS.AVAILABLE &&
                    !seat.isRemoteHeld &&
                    !seat.isSelected
                ) {
                    changed = seatData.selectSeat(row, col) || changed;
                }
            }
        }
        return changed;
    }

    _releasePointer(pointerId) {
        if (pointerId !== undefined && this.canvas.hasPointerCapture?.(pointerId)) {
            this.canvas.releasePointerCapture(pointerId);
        }
        this.state.pointerId = null;
        this.state.dragStart = null;
        this.state.dragEnd = null;
        this.state.isDragging = false;
    }
}

function sameSeat(left, right) {
    if (!left && !right) return true;
    return Boolean(left && right && left.row === right.row && left.col === right.col);
}

export default CinemaInputController;
