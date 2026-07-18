import { appendText, formatAmount } from '../commercial/CommerceView.js';

function seatStatusLabel(seat, selected, sold, held) {
    if (selected) return '已选';
    if (sold) return '已售';
    if (held) return '已被其他观众锁定';
    if (seat.kind === 'wheelchair') return '可选轮椅位';
    if (seat.kind === 'companion') return '可选陪同席';
    if (seat.zoneId === 'preferred') return '可选优选区座位';
    return '可选';
}

export class CommercialSeatMapController {
    constructor({
        map,
        scroller,
        accessibleConfirm,
        accessibleAcknowledgement,
        selectedProgress,
        getState,
        onToggleSeat
    }) {
        this.map = map;
        this.scroller = scroller;
        this.accessibleConfirm = accessibleConfirm;
        this.accessibleAcknowledgement = accessibleAcknowledgement;
        this.selectedProgress = selectedProgress;
        this.getState = getState;
        this.onToggleSeat = onToggleSeat;
        this.lastFocusedSeatId = null;
        this._bind();
    }

    _bind() {
        this.map.addEventListener('click', event => {
            const button = event.target.closest('[data-seat-id]');
            if (button && !button.disabled) this.onToggleSeat(button.dataset.seatId);
        });
        this.map.addEventListener('keydown', event => this._handleKeydown(event));
    }

    resetFocus() {
        this.lastFocusedSeatId = null;
    }

    rememberFocus(seatId) {
        this.lastFocusedSeatId = seatId;
    }

    render({ focusSeat = false } = {}) {
        const { context, draft, inventory, popularityBySeat = {}, showPopularity = false } = this.getState();
        const activeSeatId = document.activeElement?.dataset?.seatId || null;
        const previousFocus = activeSeatId || this.lastFocusedSeatId;
        const selected = new Set(draft.selectedSeatIds);
        const sold = new Set(inventory.soldSeatIds);
        const held = new Set(Object.keys(inventory.holdIdsBySeatId));
        const rows = new Map();
        context.auditorium.seats.forEach(seat => {
            if (!rows.has(seat.rowIndex)) rows.set(seat.rowIndex, []);
            rows.get(seat.rowIndex).push(seat);
        });

        const columnCount = Math.max(...context.auditorium.seats.map(seat => seat.columnIndex)) + 1;
        this.map.style.setProperty('--seat-column-count', String(columnCount));
        this.map.dataset.auditoriumSize = columnCount <= 10 ? 'small' : (columnCount <= 20 ? 'medium' : 'large');
        this.map.classList.toggle('shows-popularity', showPopularity);

        this.map.replaceChildren();
        let firstAvailableId = null;
        [...rows.entries()].sort(([left], [right]) => left - right).forEach(([, seats]) => {
            const row = document.createElement('div');
            row.className = 'seat-row';
            const label = appendText(row, 'span', seats[0].rowLabel, 'seat-row-label');
            label.setAttribute('aria-hidden', 'true');
            seats.sort((left, right) => left.columnIndex - right.columnIndex).forEach((seat, index) => {
                const button = this._createSeatButton({
                    context,
                    seat,
                    isSold: sold.has(seat.id),
                    isHeld: held.has(seat.id),
                    isSelected: selected.has(seat.id),
                    popularity: popularityBySeat[seat.id] || null,
                    showPopularity
                });
                if (index > 0 && seats[index - 1].sectionId !== seat.sectionId) {
                    button.classList.add('starts-section');
                }
                if (!button.disabled && firstAvailableId === null) firstAvailableId = seat.id;
                row.append(button);
            });
            this.map.append(row);
        });

        const canRestoreFocus = previousFocus &&
            this.map.querySelector(`[data-seat-id="${previousFocus}"]:not(:disabled)`);
        const focusId = canRestoreFocus ? previousFocus : (draft.selectedSeatIds[0] || firstAvailableId);
        const focusTarget = focusId ? this.map.querySelector(`[data-seat-id="${focusId}"]`) : null;
        if (focusTarget) focusTarget.tabIndex = 0;
        this._restoreFocus({ activeSeatId, focusSeat, focusTarget });

        const accessibleSelected = context.auditorium.seats.some(seat =>
            selected.has(seat.id) && ['wheelchair', 'companion'].includes(seat.kind)
        );
        this.accessibleConfirm.hidden = !accessibleSelected;
        this.accessibleAcknowledgement.checked = draft.accessibilityAcknowledged;
        this.selectedProgress.textContent = `${selected.size} / ${draft.ticketCount}`;
    }

    _createSeatButton({ context, seat, isSold, isHeld, isSelected, popularity, showPopularity }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'seat-button';
        if (seat.zoneId === 'preferred') button.classList.add('is-premium');
        if (['wheelchair', 'companion'].includes(seat.kind)) button.classList.add('is-accessible');
        if (isSold) button.classList.add('is-sold');
        if (isHeld) button.classList.add('is-held');
        if (isSelected) button.classList.add('is-selected');
        button.dataset.seatId = seat.id;
        button.dataset.row = String(seat.rowIndex);
        button.dataset.column = String(seat.columnIndex);
        if (popularity) button.dataset.popularity = popularity.level;
        button.disabled = isSold || isHeld;
        button.setAttribute('aria-pressed', String(isSelected));
        button.setAttribute(
            'aria-label',
            `${seat.label}，${seat.zoneId === 'preferred' ?
                `座位附加费${formatAmount(context.pricingPolicy.seatZoneSurcharges[seat.zoneId])}` :
                '无座位附加费'}，${showPopularity && popularity ?
                `热度参考${{ hot: '热门', warm: '一般', cool: '冷门' }[popularity.level]}，` : ''}` +
                seatStatusLabel(seat, isSelected, isSold, isHeld)
        );
        button.textContent = seat.kind === 'wheelchair' ? '♿' :
            (seat.kind === 'companion' ? '陪' : String(seat.seatNumber));
        button.tabIndex = -1;
        return button;
    }

    _restoreFocus({ activeSeatId, focusSeat, focusTarget }) {
        if (activeSeatId && !focusSeat && focusTarget) {
            focusTarget.focus({ preventScroll: true });
        } else if (focusSeat && focusTarget) {
            requestAnimationFrame(() => {
                this.scroller.scrollLeft = Math.max(
                    0,
                    focusTarget.offsetLeft - this.scroller.clientWidth / 2
                );
                focusTarget.focus({ preventScroll: true });
            });
        }
    }

    _handleKeydown(event) {
        const current = event.target.closest('[data-seat-id]');
        if (!current) return;
        if ([' ', 'Space', 'Spacebar'].includes(event.key)) {
            event.preventDefault();
            current.click();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const target = this._nextKeyboardTarget(current, event.key);
        if (!target) return;
        current.tabIndex = -1;
        target.tabIndex = 0;
        this.lastFocusedSeatId = target.dataset.seatId;
        target.focus();
    }

    _nextKeyboardTarget(current, key) {
        const buttons = [...this.map.querySelectorAll('[data-seat-id]:not(:disabled)')];
        const row = Number(current.dataset.row);
        const column = Number(current.dataset.column);
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const candidates = buttons
                .filter(button => Number(button.dataset.row) === row)
                .sort((left, right) => Number(left.dataset.column) - Number(right.dataset.column));
            const index = candidates.indexOf(current);
            return candidates[index + (key === 'ArrowLeft' ? -1 : 1)] || null;
        }

        const direction = key === 'ArrowUp' ? -1 : 1;
        return buttons
            .filter(button => (Number(button.dataset.row) - row) * direction > 0)
            .sort((left, right) => {
                const leftRowDistance = Math.abs(Number(left.dataset.row) - row);
                const rightRowDistance = Math.abs(Number(right.dataset.row) - row);
                if (leftRowDistance !== rightRowDistance) return leftRowDistance - rightRowDistance;
                return Math.abs(Number(left.dataset.column) - column) -
                    Math.abs(Number(right.dataset.column) - column);
            })[0] || null;
    }
}

export default CommercialSeatMapController;
