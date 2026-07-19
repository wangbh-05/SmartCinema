import { formatAmount } from '../commercial/CommerceView.js';
import {
    canvasPoint,
    centerTextMetricsInRectangle,
    createCurvedSeatLayout,
    createHeatmapBitmap,
    heatScoreForPeriod,
    hitTestSeat,
    prepareCanvas,
    readCanvasTheme,
    seatsInsideRectangle
} from '../canvas/CanvasSeatMapView.js';

function seatStatusLabel(seat, selected, sold, held) {
    if (selected) return '已选';
    if (sold) return '已售';
    if (held) return '已被其他观众锁定';
    if (seat.kind === 'wheelchair') return '可选轮椅位';
    if (seat.kind === 'companion') return '可选陪同席';
    if (seat.zoneId === 'preferred') return '可选优选区座位';
    return '可选';
}

function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
}

export class CommercialSeatMapController {
    constructor({
        map,
        scroller,
        surface,
        canvas,
        heatCanvas,
        tooltip,
        accessibleConfirm,
        accessibleAcknowledgement,
        selectedProgress,
        getState,
        onToggleSeat,
        onSelectSeats = () => {}
    }) {
        this.map = map;
        this.scroller = scroller;
        this.surface = surface;
        this.canvas = canvas;
        this.heatCanvas = heatCanvas;
        this.tooltip = tooltip;
        this.accessibleConfirm = accessibleConfirm;
        this.accessibleAcknowledgement = accessibleAcknowledgement;
        this.selectedProgress = selectedProgress;
        this.getState = getState;
        this.onToggleSeat = onToggleSeat;
        this.onSelectSeats = onSelectSeats;
        this.lastFocusedSeatId = null;
        this.lastCenteredAuditoriumId = null;
        this.hoveredSeatId = null;
        this.layout = null;
        this.drag = null;
        this.suppressNextClick = false;
        this.tooltipTimer = null;
        this.hasShownTooltip = false;
        this.lastHeatKey = null;
        this.heatBitmap = null;
        this.heatAnimation = null;
        this._bind();
    }

    _bind() {
        this.map.addEventListener('click', event => {
            const button = event.target.closest('[data-seat-id]');
            if (button && !button.disabled) this.onToggleSeat(button.dataset.seatId);
        });
        this.map.addEventListener('keydown', event => this._handleSemanticKeydown(event));
        this.canvas.addEventListener('keydown', event => this._handleCanvasKeydown(event));
        this.canvas.addEventListener('click', event => this._handleCanvasClick(event));
        this.canvas.addEventListener('pointermove', event => this._handlePointerMove(event));
        this.canvas.addEventListener('pointerleave', () => this._clearHover());
        this.canvas.addEventListener('pointerdown', event => this._handlePointerDown(event));
        this.canvas.addEventListener('pointerup', event => this._handlePointerUp(event));
        this.canvas.addEventListener('pointercancel', () => this._cancelDrag());
        this.canvas.addEventListener('focus', () => {
            if (!this.lastFocusedSeatId) this.lastFocusedSeatId = this._firstAvailableSeatId();
            this._renderCanvas(this.getState(), readCanvasTheme(document.body));
        });
        this.canvas.addEventListener('blur', () => {
            this._hideTooltip();
            this._renderCanvas(this.getState(), readCanvasTheme(document.body));
        });
        const observer = new MutationObserver(() => {
            if (this.layout) this.render();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-commerce-motion']
        });
        this.preferenceObserver = observer;
    }

    resetFocus() {
        this.lastFocusedSeatId = null;
        this.hoveredSeatId = null;
        this.lastHeatKey = null;
        this.heatBitmap = null;
        this._hideTooltip();
    }

    rememberFocus(seatId) {
        this.lastFocusedSeatId = seatId;
    }

    render({ focusSeat = false } = {}) {
        const state = this.getState();
        if (!state.context || !state.draft || !state.inventory) return;
        const { context, draft, inventory, showPopularity = false } = state;
        const theme = readCanvasTheme(document.body);
        this.layout = createCurvedSeatLayout(context.auditorium, { readable: theme.readable });
        this.surface.style.width = `${this.layout.width}px`;
        this.surface.style.height = `${this.layout.height}px`;
        this.surface.dataset.auditoriumSize = this.layout.columnCount <= 10 ? 'small' :
            (this.layout.columnCount <= 20 ? 'medium' : 'large');
        this.map.classList.toggle('shows-popularity', showPopularity);
        this.canvas.setAttribute('aria-rowcount', String(this.layout.rowCount));
        this.canvas.setAttribute('aria-colcount', String(this.layout.columnCount));

        this._renderSemanticSeats(state);
        this._renderHeatmap(state, theme);
        this._renderCanvas(state, theme);
        this._renderAccessibleConfirmation(state);
        this._centerLargeAuditorium(context.auditorium.id);

        const focusId = this.lastFocusedSeatId || draft.selectedSeatIds[0] || this._firstAvailableSeatId();
        if (focusId) {
            this.lastFocusedSeatId = focusId;
            this.canvas.setAttribute('aria-activedescendant', `seat-option-${focusId}`);
        }
        if (focusSeat && focusId) {
            const target = this.map.querySelector(`[data-seat-id="${focusId}"]`);
            target?.focus({ preventScroll: true });
        }
    }

    _renderSemanticSeats(state) {
        const { context, draft, inventory, popularityBySeat = {}, showPopularity, heatPeriod = 'week' } = state;
        const selected = new Set(draft.selectedSeatIds);
        const sold = new Set(inventory.soldSeatIds);
        const held = new Set(Object.keys(inventory.holdIdsBySeatId));
        const previousFocus = document.activeElement?.dataset?.seatId || null;
        const fragment = document.createDocumentFragment();
        this.layout.seats.forEach(seat => {
            const button = document.createElement('button');
            const isSelected = selected.has(seat.id);
            const isSold = sold.has(seat.id);
            const isHeld = held.has(seat.id);
            const popularity = popularityBySeat[seat.id];
            const heatScore = heatScoreForPeriod(seat, popularity, heatPeriod);
            button.id = `seat-option-${seat.id}`;
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
            button.setAttribute('aria-label',
                `${seat.label}，${seat.zoneId === 'preferred' ?
                    `座位附加费${formatAmount(context.pricingPolicy.seatZoneSurcharges[seat.zoneId])}` :
                    '无座位附加费'}，${showPopularity ? `热度${heatScore}分，` : ''}` +
                seatStatusLabel(seat, isSelected, isSold, isHeld)
            );
            button.textContent = seat.kind === 'wheelchair' ? '轮椅位' :
                (seat.kind === 'companion' ? '陪同席' : seat.label);
            button.tabIndex = seat.id === (previousFocus || this.lastFocusedSeatId) ? 0 : -1;
            fragment.append(button);
        });
        this.map.replaceChildren(fragment);
        if (!this.map.querySelector('[tabindex="0"]')) {
            const first = this.map.querySelector('[data-seat-id]:not(:disabled)');
            if (first) first.tabIndex = 0;
        }
        if (previousFocus) {
            this.map.querySelector(`[data-seat-id="${previousFocus}"]`)?.focus({ preventScroll: true });
        }
    }

    _renderHeatmap(state, theme) {
        const context = prepareCanvas(this.heatCanvas, this.layout.width, this.layout.height);
        if (!state.showPopularity) {
            this.lastHeatKey = null;
            this.heatCanvas.hidden = true;
            return;
        }
        this.heatCanvas.hidden = false;
        const heatKey = `${state.context.auditorium.id}:${state.inventory.revision}:${state.heatPeriod}:` +
            `${theme.highContrast}:${theme.accent}:${this.layout.width}`;
        if (!this.heatBitmap || this.lastHeatKey !== heatKey) {
            this.heatBitmap = createHeatmapBitmap({
                layout: this.layout,
                popularityBySeat: state.popularityBySeat || {},
                period: state.heatPeriod || 'week',
                theme
            });
        }
        context.save();
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(this.heatBitmap, 0, 0, this.layout.width, this.layout.height);
        if (theme.colorblind) this._drawHeatContours(context);
        context.restore();
        if (this.lastHeatKey && this.lastHeatKey !== heatKey && !theme.reduceMotion) {
            this.heatAnimation?.cancel();
            this.heatAnimation = this.heatCanvas.animate(
                [{ opacity: 0.62 }, { opacity: 1 }],
                { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
            );
        }
        this.lastHeatKey = heatKey;
    }

    _drawHeatContours(context) {
        context.save();
        context.strokeStyle = 'rgba(245, 247, 251, 0.34)';
        context.lineWidth = 1;
        context.setLineDash([4, 5]);
        const rows = new Map();
        this.layout.seats.forEach(seat => {
            if (!rows.has(seat.rowIndex)) rows.set(seat.rowIndex, []);
            rows.get(seat.rowIndex).push(seat);
        });
        rows.forEach(seats => {
            seats.sort((left, right) => left.columnIndex - right.columnIndex);
            context.beginPath();
            seats.forEach((seat, index) => {
                if (index === 0) context.moveTo(seat.centerX, seat.centerY);
                else context.lineTo(seat.centerX, seat.centerY);
            });
            context.stroke();
        });
        context.restore();
    }

    _renderCanvas(state, theme) {
        const context = prepareCanvas(this.canvas, this.layout.width, this.layout.height);
        this._drawScreen(context, theme);
        const sold = new Set(state.inventory.soldSeatIds);
        const held = new Set(Object.keys(state.inventory.holdIdsBySeatId));
        const selected = new Set(state.draft.selectedSeatIds);
        const recommended = new Set(state.recommendedSeatIds || []);
        this.layout.seats.forEach(seat => this._drawSeat(context, seat, theme, {
            sold: sold.has(seat.id),
            held: held.has(seat.id),
            selected: selected.has(seat.id),
            recommended: recommended.has(seat.id),
            hovered: seat.id === this.hoveredSeatId,
            focused: document.activeElement === this.canvas && seat.id === this.lastFocusedSeatId
        }));
        this._drawRowLabels(context, theme);
        if (this.drag?.active) this._drawDragRectangle(context, theme);
    }

    _drawScreen(context, theme) {
        const centerX = this.layout.width / 2;
        const screenWidth = Math.min(this.layout.width * 0.66, 620);
        const startX = centerX - screenWidth / 2;
        const gradient = context.createLinearGradient(startX, 0, startX + screenWidth, 0);
        gradient.addColorStop(0, 'rgba(205, 215, 235, 0)');
        gradient.addColorStop(0.2, 'rgba(205, 215, 235, 0.74)');
        gradient.addColorStop(0.5, '#ffffff');
        gradient.addColorStop(0.8, 'rgba(205, 215, 235, 0.74)');
        gradient.addColorStop(1, 'rgba(205, 215, 235, 0)');
        context.save();
        context.strokeStyle = gradient;
        context.lineWidth = 4;
        context.shadowColor = 'rgba(182, 204, 246, 0.38)';
        context.shadowBlur = 18;
        context.beginPath();
        context.moveTo(startX, 45);
        context.quadraticCurveTo(centerX, 30, startX + screenWidth, 45);
        context.stroke();
        context.restore();
        context.fillStyle = 'rgba(174, 182, 196, 0.62)';
        context.font = '9px ui-sans-serif, system-ui, sans-serif';
        context.textAlign = 'center';
        context.letterSpacing = '2px';
        context.fillText('银幕方向', centerX, 70);
    }

    _drawSeat(context, seat, theme, state) {
        const scale = state.hovered && !theme.reduceMotion ? 1.06 : 1;
        const backHeight = seat.height - 3;
        const label = seat.kind === 'wheelchair' ? '♿' :
            (seat.kind === 'companion' ? '陪' : String(seat.seatNumber));
        context.save();
        context.translate(seat.centerX, seat.centerY);
        context.rotate(seat.rotation);
        context.scale(scale, scale);
        context.translate(-seat.width / 2, -seat.height / 2);

        let border = '#697282';
        let fill = 'rgba(16, 19, 25, 0.7)';
        let text = '#aeb6c4';
        if (seat.zoneId === 'preferred') border = theme.premium;
        if (['wheelchair', 'companion'].includes(seat.kind)) border = theme.accessible;
        if (state.sold || state.held) {
            border = '#333944';
            fill = '#2a2f38';
            text = '#626a77';
        }
        if (state.selected) {
            border = theme.accent;
            fill = theme.accent;
            text = '#ffffff';
        }
        if (state.hovered && !state.sold && !state.held) border = state.selected ? '#ffffff' : '#dce3ef';

        if (state.recommended) {
            context.save();
            context.strokeStyle = theme.accent;
            context.lineWidth = state.selected ? 2 : 2.2;
            context.shadowColor = theme.accent;
            context.shadowBlur = state.selected ? 8 : 5;
            roundRect(context, -4, -4, seat.width + 8, seat.height + 8, 9);
            context.stroke();
            context.restore();
        }

        context.fillStyle = fill;
        context.strokeStyle = border;
        context.lineWidth = theme.highContrast ? 2 : 1.2;
        roundRect(context, 0, 0, seat.width, backHeight, 6);
        context.fill();
        context.stroke();

        if (theme.colorblind && (state.sold || state.held)) {
            context.save();
            roundRect(context, 0, 0, seat.width, backHeight, 6);
            context.clip();
            context.strokeStyle = '#59616e';
            context.lineWidth = 1;
            for (let offset = -seat.height; offset < seat.width + seat.height; offset += 6) {
                context.beginPath();
                context.moveTo(offset, backHeight);
                context.lineTo(offset + backHeight, 0);
                context.stroke();
            }
            context.restore();
        }

        context.globalAlpha = state.sold || state.held ? 0.42 : 0.62;
        context.fillStyle = border;
        roundRect(context, 4, backHeight - 1, seat.width - 8, 4, 2);
        context.fill();
        context.globalAlpha = 1;

        if (state.sold || state.held) {
            context.strokeStyle = text;
            context.lineWidth = 1.2;
            context.beginPath();
            context.moveTo(5, backHeight / 2);
            context.lineTo(seat.width - 5, backHeight / 2);
            context.stroke();
        }
        if (state.focused) {
            context.strokeStyle = theme.highContrast ? '#ffffff' : '#8db3ff';
            context.lineWidth = theme.highContrast ? 3 : 2;
            roundRect(context, -6, -6, seat.width + 12, seat.height + 12, 10);
            context.stroke();
        }
        context.restore();

        // Use the rounded backrest's exact local centre as the anchor, then
        // apply the same rotation as the chair. Ink bounds, rather than text
        // advance width, keep asymmetric labels such as 1, 10 and 11 centred.
        context.save();
        context.translate(seat.centerX, seat.centerY);
        context.rotate(seat.rotation);
        context.fillStyle = text;
        const fontSize = theme.readable ? 9 : (seat.kind === 'wheelchair' ? 10 : 8);
        context.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        const metrics = context.measureText(label);
        const placement = centerTextMetricsInRectangle(metrics, {
            x: -seat.width * scale / 2,
            y: -seat.height * scale / 2,
            width: seat.width * scale,
            height: backHeight * scale
        }, {
            fallbackAscent: fontSize * 0.72,
            fallbackDescent: fontSize * 0.2
        });
        context.fillText(label, placement.x, placement.baselineY);
        context.restore();
    }

    _drawRowLabels(context, theme) {
        const rows = new Map();
        this.layout.seats.forEach(seat => {
            if (!rows.has(seat.rowIndex)) rows.set(seat.rowIndex, []);
            rows.get(seat.rowIndex).push(seat);
        });
        context.fillStyle = theme.highContrast ? '#dce3ef' : '#697281';
        context.font = `${theme.readable ? 11 : 10}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        rows.forEach(seats => {
            const left = [...seats].sort((a, b) => a.columnIndex - b.columnIndex)[0];
            const right = [...seats].sort((a, b) => b.columnIndex - a.columnIndex)[0];
            context.fillText(left.rowLabel, left.x - 25, left.centerY);
            context.fillText(right.rowLabel, right.x + right.width + 25, right.centerY);
        });
    }

    _drawDragRectangle(context, theme) {
        const { startX, startY, endX, endY } = this.drag;
        context.save();
        context.fillStyle = 'rgba(212, 63, 69, 0.12)';
        context.strokeStyle = theme.accent;
        context.lineWidth = 1.5;
        context.setLineDash([5, 4]);
        context.fillRect(startX, startY, endX - startX, endY - startY);
        context.strokeRect(startX, startY, endX - startX, endY - startY);
        context.restore();
    }

    _renderAccessibleConfirmation(state) {
        const selected = new Set(state.draft.selectedSeatIds);
        const accessibleSelected = state.context.auditorium.seats.some(seat =>
            selected.has(seat.id) && ['wheelchair', 'companion'].includes(seat.kind)
        );
        this.accessibleConfirm.hidden = !accessibleSelected;
        this.accessibleAcknowledgement.checked = state.draft.accessibilityAcknowledged;
        this.selectedProgress.textContent = `${selected.size} / ${state.draft.ticketCount}`;
    }

    _handleCanvasClick(event) {
        if (this.suppressNextClick) {
            this.suppressNextClick = false;
            return;
        }
        const point = canvasPoint(this.canvas, event);
        const seat = hitTestSeat(this.layout, point.x, point.y);
        if (!seat || this._isUnavailable(seat.id)) return;
        this.lastFocusedSeatId = seat.id;
        this.canvas.focus({ preventScroll: true });
        this.onToggleSeat(seat.id);
    }

    _handlePointerMove(event) {
        if (!this.layout) return;
        const point = canvasPoint(this.canvas, event);
        if (this.drag) {
            this.drag.endX = point.x;
            this.drag.endY = point.y;
            if (Math.hypot(point.x - this.drag.startX, point.y - this.drag.startY) > 8) {
                this.drag.active = true;
                this.suppressNextClick = true;
            }
            this._renderCanvas(this.getState(), readCanvasTheme(document.body));
            return;
        }
        if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const seat = hitTestSeat(this.layout, point.x, point.y);
        const nextId = seat?.id || null;
        if (nextId === this.hoveredSeatId) return;
        this.hoveredSeatId = nextId;
        this.canvas.style.cursor = seat && !this._isUnavailable(seat.id) ? 'pointer' : 'default';
        this._renderCanvas(this.getState(), readCanvasTheme(document.body));
        if (seat) this._scheduleTooltip(seat, point);
        else this._hideTooltip();
    }

    _handlePointerDown(event) {
        if (event.pointerType === 'touch' || event.button !== 0) return;
        const point = canvasPoint(this.canvas, event);
        this.drag = { startX: point.x, startY: point.y, endX: point.x, endY: point.y, active: false };
        this.canvas.setPointerCapture(event.pointerId);
    }

    _handlePointerUp(event) {
        if (!this.drag) return;
        const drag = this.drag;
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        this.drag = null;
        if (drag.active) {
            const seatIds = seatsInsideRectangle(this.layout, drag)
                .filter(seat => !this._isUnavailable(seat.id) && !['wheelchair', 'companion'].includes(seat.kind))
                .map(seat => seat.id);
            if (seatIds.length > 0) this.onSelectSeats(seatIds);
        }
        this._renderCanvas(this.getState(), readCanvasTheme(document.body));
    }

    _cancelDrag() {
        this.drag = null;
        this.suppressNextClick = false;
        this.render();
    }

    _scheduleTooltip(seat, point) {
        clearTimeout(this.tooltipTimer);
        const delay = this.hasShownTooltip ? 0 : 140;
        this.tooltipTimer = setTimeout(() => {
            const state = this.getState();
            const score = heatScoreForPeriod(seat, state.popularityBySeat?.[seat.id], state.heatPeriod);
            const status = seatStatusLabel(
                seat,
                state.draft.selectedSeatIds.includes(seat.id),
                state.inventory.soldSeatIds.includes(seat.id),
                Boolean(state.inventory.holdIdsBySeatId[seat.id])
            );
            this.tooltip.replaceChildren();
            const strong = document.createElement('strong');
            strong.textContent = seat.label;
            const span = document.createElement('span');
            span.textContent = `${status}${state.showPopularity ? ` · 热度 ${score}` : ''}`;
            this.tooltip.append(strong, span);
            this.tooltip.style.left = `${Math.min(this.layout.width - 155, point.x + 14)}px`;
            this.tooltip.style.top = `${Math.max(8, point.y - 52)}px`;
            this.tooltip.hidden = false;
            this.hasShownTooltip = true;
        }, delay);
    }

    _hideTooltip() {
        clearTimeout(this.tooltipTimer);
        this.tooltip.hidden = true;
    }

    _clearHover() {
        if (this.drag) return;
        this.hoveredSeatId = null;
        this.canvas.style.cursor = 'default';
        this._hideTooltip();
        if (this.layout) this._renderCanvas(this.getState(), readCanvasTheme(document.body));
    }

    _handleCanvasKeydown(event) {
        if ([' ', 'Space', 'Spacebar'].includes(event.key)) {
            event.preventDefault();
            if (this.lastFocusedSeatId && !this._isUnavailable(this.lastFocusedSeatId)) {
                this.onToggleSeat(this.lastFocusedSeatId);
            }
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const target = this._nextSeat(this.lastFocusedSeatId, event.key);
        if (!target) return;
        this.lastFocusedSeatId = target.id;
        this.canvas.setAttribute('aria-activedescendant', `seat-option-${target.id}`);
        this._renderCanvas(this.getState(), readCanvasTheme(document.body));
    }

    _handleSemanticKeydown(event) {
        const current = event.target.closest('[data-seat-id]');
        if (!current) return;
        if ([' ', 'Space', 'Spacebar'].includes(event.key)) {
            event.preventDefault();
            current.click();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const targetSeat = this._nextSeat(current.dataset.seatId, event.key);
        if (!targetSeat) return;
        current.tabIndex = -1;
        const target = this.map.querySelector(`[data-seat-id="${targetSeat.id}"]`);
        target.tabIndex = 0;
        this.lastFocusedSeatId = targetSeat.id;
        target.focus();
    }

    _nextSeat(currentId, key) {
        const current = this.layout.seats.find(seat => seat.id === currentId) ||
            this.layout.seats.find(seat => !this._isUnavailable(seat.id));
        if (!current) return null;
        const available = this.layout.seats.filter(seat => !this._isUnavailable(seat.id));
        if (key === 'Home' || key === 'End') {
            const row = available.filter(seat => seat.rowIndex === current.rowIndex)
                .sort((left, right) => left.columnIndex - right.columnIndex);
            return key === 'Home' ? row[0] : row[row.length - 1];
        }
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const row = available.filter(seat => seat.rowIndex === current.rowIndex)
                .sort((left, right) => left.columnIndex - right.columnIndex);
            const index = row.findIndex(seat => seat.id === current.id);
            return row[index + (key === 'ArrowLeft' ? -1 : 1)] || null;
        }
        const direction = key === 'ArrowUp' ? -1 : 1;
        return available
            .filter(seat => (seat.rowIndex - current.rowIndex) * direction > 0)
            .sort((left, right) => {
                const rowDistance = Math.abs(left.rowIndex - current.rowIndex) -
                    Math.abs(right.rowIndex - current.rowIndex);
                return rowDistance || Math.abs(left.columnIndex - current.columnIndex) -
                    Math.abs(right.columnIndex - current.columnIndex);
            })[0] || null;
    }

    _isUnavailable(seatId) {
        const { inventory } = this.getState();
        return inventory.soldSeatIds.includes(seatId) || Boolean(inventory.holdIdsBySeatId[seatId]);
    }

    _firstAvailableSeatId() {
        return this.layout?.seats.find(seat => !this._isUnavailable(seat.id))?.id || null;
    }

    _centerLargeAuditorium(auditoriumId) {
        if (this.layout.columnCount <= 20 || this.lastCenteredAuditoriumId === auditoriumId) return;
        this.lastCenteredAuditoriumId = auditoriumId;
        requestAnimationFrame(() => {
            this.scroller.scrollLeft = Math.max(0, (this.scroller.scrollWidth - this.scroller.clientWidth) / 2);
        });
    }
}

export default CommercialSeatMapController;
