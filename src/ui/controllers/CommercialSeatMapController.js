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

const MOBILE_BREAKPOINT = 780;
const VIEW_PADDING = 14;
const PAN_THRESHOLD = 7;

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function pointerDistance(left, right) {
    return Math.hypot(right.x - left.x, right.y - left.y);
}

function pointerMidpoint(left, right) {
    return {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2
    };
}

function rubberband(value, minimum, maximum) {
    if (value < minimum) return minimum + (value - minimum) * 0.2;
    if (value > maximum) return maximum + (value - maximum) * 0.2;
    return value;
}

export class CommercialSeatMapController {
    constructor({
        map,
        scroller,
        viewport,
        surface,
        canvas,
        heatCanvas,
        tooltip,
        zoomOutButton,
        zoomFitButton,
        zoomInButton,
        zoomStatus,
        gestureHint,
        accessibleConfirm,
        accessibleAcknowledgement,
        selectedProgress,
        getState,
        onToggleSeat,
        onSelectSeats = () => {}
    }) {
        this.map = map;
        this.scroller = scroller;
        this.viewport = viewport;
        this.surface = surface;
        this.canvas = canvas;
        this.heatCanvas = heatCanvas;
        this.tooltip = tooltip;
        this.zoomOutButton = zoomOutButton;
        this.zoomFitButton = zoomFitButton;
        this.zoomInButton = zoomInButton;
        this.zoomStatus = zoomStatus;
        this.gestureHint = gestureHint;
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
        this.activePointers = new Map();
        this.pinch = null;
        this.touchPan = null;
        this.viewAnimation = null;
        this.resizeFrame = null;
        this.view = {
            auditoriumId: null,
            mobile: false,
            scale: 1,
            minScale: 1,
            maxScale: 1,
            panX: 0,
            panY: 0
        };
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
        this.canvas.addEventListener('pointercancel', event => this._handlePointerCancel(event));
        this.zoomOutButton?.addEventListener('click', event => this._stepZoom(-1, event.detail === 0));
        this.zoomFitButton?.addEventListener('click', event => this._fitView({ immediate: event.detail === 0 }));
        this.zoomInButton?.addEventListener('click', event => this._stepZoom(1, event.detail === 0));
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
        window.addEventListener('resize', () => {
            if (this.resizeFrame !== null) return;
            this.resizeFrame = requestAnimationFrame(() => {
                this.resizeFrame = null;
                if (this.layout) this._configureViewport({ preserveScale: true });
            });
        });
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
        this._configureViewport({
            preserveScale: this.view.auditoriumId === context.auditorium.id
        });
        this.view.auditoriumId = context.auditorium.id;
        this.surface.dataset.auditoriumSize = this.layout.columnCount <= 10 ? 'small' :
            (this.layout.columnCount <= 20 ? 'medium' : 'large');
        this.map.classList.toggle('shows-popularity', showPopularity);
        this.canvas.setAttribute('aria-rowcount', String(this.layout.rowCount));
        this.canvas.setAttribute('aria-colcount', String(this.layout.columnCount));

        this._renderSemanticSeats(state);
        this._renderHeatmap(state, theme);
        this._renderCanvas(state, theme);
        this._renderAccessibleConfirmation(state);
        if (!this.view.mobile) this._centerLargeAuditorium(context.auditorium.id);

        const focusId = this.lastFocusedSeatId || draft.selectedSeatIds[0] || this._firstAvailableSeatId();
        if (focusId) {
            this.lastFocusedSeatId = focusId;
            this.canvas.setAttribute('aria-activedescendant', `seat-option-${focusId}`);
        }
        if (focusSeat && focusId) {
            this.canvas.focus({ preventScroll: true });
            this._revealSeat(focusId);
        }
    }

    _configureViewport({ preserveScale = false } = {}) {
        const mobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
        const wasMobile = this.view.mobile;
        this.view.mobile = mobile;
        this.viewport.classList.toggle('is-mobile-seat-view', mobile);

        if (!mobile) {
            this._stopViewAnimation();
            this.view = {
                ...this.view,
                mobile: false,
                scale: 1,
                minScale: 1,
                maxScale: 1,
                panX: 0,
                panY: 0
            };
            this.surface.style.transform = 'none';
            this.surface.removeAttribute('data-seat-zoom-scale');
            this.viewport.classList.remove('is-zoomed');
            this._updateZoomControls();
            return;
        }

        const viewportWidth = Math.max(1, this.viewport.clientWidth);
        const viewportHeight = Math.max(1, this.viewport.clientHeight);
        const fittedScale = Math.min(
            1,
            (viewportWidth - VIEW_PADDING * 2) / this.layout.width,
            (viewportHeight - VIEW_PADDING * 2) / this.layout.height
        );
        const minScale = clamp(fittedScale, 0.26, 1);
        const maxScale = clamp(Math.max(1.25, minScale * 3.4), 1.25, 2.2);
        const keepCurrentScale = preserveScale && wasMobile;
        const scale = keepCurrentScale ? clamp(this.view.scale, minScale, maxScale) : minScale;
        const centered = this._centeredPan(scale);
        this.view = {
            ...this.view,
            mobile: true,
            minScale,
            maxScale,
            scale,
            panX: keepCurrentScale ? this.view.panX : centered.x,
            panY: keepCurrentScale ? this.view.panY : centered.y
        };
        const constrained = this._constrainView(this.view);
        this.view.panX = constrained.panX;
        this.view.panY = constrained.panY;
        this.scroller.scrollLeft = 0;
        this.scroller.scrollTop = 0;
        this._applyViewTransform();
    }

    _centeredPan(scale) {
        return {
            x: (this.viewport.clientWidth - this.layout.width * scale) / 2,
            y: (this.viewport.clientHeight - this.layout.height * scale) / 2
        };
    }

    _panBounds(scale) {
        const viewportWidth = this.viewport.clientWidth;
        const viewportHeight = this.viewport.clientHeight;
        const contentWidth = this.layout.width * scale;
        const contentHeight = this.layout.height * scale;
        const centered = this._centeredPan(scale);
        return {
            minX: contentWidth <= viewportWidth - VIEW_PADDING * 2 ?
                centered.x : viewportWidth - contentWidth - VIEW_PADDING,
            maxX: contentWidth <= viewportWidth - VIEW_PADDING * 2 ?
                centered.x : VIEW_PADDING,
            minY: contentHeight <= viewportHeight - VIEW_PADDING * 2 ?
                centered.y : viewportHeight - contentHeight - VIEW_PADDING,
            maxY: contentHeight <= viewportHeight - VIEW_PADDING * 2 ?
                centered.y : VIEW_PADDING
        };
    }

    _constrainView({ scale, panX, panY }, { resist = false } = {}) {
        const nextScale = resist ?
            rubberband(scale, this.view.minScale, this.view.maxScale) :
            clamp(scale, this.view.minScale, this.view.maxScale);
        const bounds = this._panBounds(nextScale);
        return {
            scale: nextScale,
            panX: resist ? rubberband(panX, bounds.minX, bounds.maxX) :
                clamp(panX, bounds.minX, bounds.maxX),
            panY: resist ? rubberband(panY, bounds.minY, bounds.maxY) :
                clamp(panY, bounds.minY, bounds.maxY)
        };
    }

    _applyViewTransform({ renderLabels = true } = {}) {
        if (!this.view.mobile) return;
        const { scale, panX, panY, minScale } = this.view;
        this.surface.style.transform =
            `translate3d(${panX.toFixed(3)}px, ${panY.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`;
        this.surface.dataset.seatZoomScale = scale.toFixed(3);
        const zoomed = scale > minScale + 0.035;
        this.viewport.classList.toggle('is-zoomed', zoomed);
        const labelMode = scale < 0.62 ? 'overview' : 'readable';
        this.viewport.dataset.seatLabelMode = labelMode;
        if (renderLabels && this.lastLabelMode !== labelMode && this.layout) {
            this.lastLabelMode = labelMode;
            this._renderCanvas(this.getState(), readCanvasTheme(document.body));
        }
        this._updateZoomControls();
    }

    _updateZoomControls() {
        if (!this.zoomStatus) return;
        if (!this.view.mobile) {
            this.zoomStatus.textContent = '完整视图';
            return;
        }
        const atMinimum = this.view.scale <= this.view.minScale + 0.01;
        this.zoomStatus.textContent = atMinimum ?
            '完整视图 · 双指放大' :
            `${Math.round(this.view.scale * 100)}% · 拖动查看`;
        this.zoomOutButton.disabled = atMinimum;
        this.zoomInButton.disabled = this.view.scale >= this.view.maxScale - 0.01;
        this.zoomFitButton.disabled = atMinimum;
        this.gestureHint.setAttribute('aria-hidden', String(!atMinimum));
    }

    _fitView({ immediate = false } = {}) {
        if (!this.view.mobile) return;
        const centered = this._centeredPan(this.view.minScale);
        this._animateViewTo({
            scale: this.view.minScale,
            panX: centered.x,
            panY: centered.y
        }, { immediate });
    }

    _stepZoom(direction, immediate = false) {
        if (!this.view.mobile) return;
        const factor = direction > 0 ? 1.32 : 1 / 1.32;
        const targetScale = clamp(
            this.view.scale * factor,
            this.view.minScale,
            this.view.maxScale
        );
        this._zoomAroundPoint(targetScale, {
            x: this.viewport.clientWidth / 2,
            y: this.viewport.clientHeight / 2
        }, { immediate });
    }

    _zoomAroundPoint(targetScale, point, { immediate = false } = {}) {
        const anchorX = (point.x - this.view.panX) / this.view.scale;
        const anchorY = (point.y - this.view.panY) / this.view.scale;
        const target = this._constrainView({
            scale: targetScale,
            panX: point.x - anchorX * targetScale,
            panY: point.y - anchorY * targetScale
        });
        this._animateViewTo(target, { immediate });
    }

    _animateViewTo(target, { immediate = false } = {}) {
        const theme = readCanvasTheme(document.body);
        this._stopViewAnimation();
        if (immediate || theme.reduceMotion) {
            Object.assign(this.view, target);
            this._applyViewTransform();
            return;
        }

        let previousTime = performance.now();
        const velocity = { scale: 0, panX: 0, panY: 0 };
        const stiffness = 240;
        const damping = 31;
        const tick = now => {
            const delta = Math.min(0.032, Math.max(0.001, (now - previousTime) / 1000));
            previousTime = now;
            let settled = true;
            for (const key of ['scale', 'panX', 'panY']) {
                const displacement = target[key] - this.view[key];
                const acceleration = stiffness * displacement - damping * velocity[key];
                velocity[key] += acceleration * delta;
                this.view[key] += velocity[key] * delta;
                const tolerance = key === 'scale' ? 0.001 : 0.12;
                if (Math.abs(displacement) > tolerance || Math.abs(velocity[key]) > tolerance) {
                    settled = false;
                }
            }
            this._applyViewTransform();
            if (settled) {
                Object.assign(this.view, target);
                this._applyViewTransform();
                this.viewAnimation = null;
                return;
            }
            this.viewAnimation = requestAnimationFrame(tick);
        };
        this.viewAnimation = requestAnimationFrame(tick);
    }

    _stopViewAnimation() {
        if (this.viewAnimation !== null) cancelAnimationFrame(this.viewAnimation);
        this.viewAnimation = null;
    }

    _revealSeat(seatId) {
        if (!this.view.mobile || this.view.scale <= this.view.minScale + 0.035) return;
        const seat = this.layout.seats.find(item => item.id === seatId);
        if (!seat) return;
        const margin = 38;
        const screenX = this.view.panX + seat.centerX * this.view.scale;
        const screenY = this.view.panY + seat.centerY * this.view.scale;
        let panX = this.view.panX;
        let panY = this.view.panY;
        if (screenX < margin) panX += margin - screenX;
        if (screenX > this.viewport.clientWidth - margin) {
            panX -= screenX - (this.viewport.clientWidth - margin);
        }
        if (screenY < margin) panY += margin - screenY;
        if (screenY > this.viewport.clientHeight - margin) {
            panY -= screenY - (this.viewport.clientHeight - margin);
        }
        const target = this._constrainView({ ...this.view, panX, panY });
        Object.assign(this.view, target);
        this._applyViewTransform();
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
        const hoverScale = state.hovered && !theme.reduceMotion ? 1.06 : 1;
        const backHeight = seat.height - 3;
        const label = seat.kind === 'wheelchair' ? '♿' :
            (seat.kind === 'companion' ? '陪' : String(seat.seatNumber));
        context.save();
        context.translate(seat.centerX, seat.centerY);
        context.rotate(seat.rotation);
        context.scale(hoverScale, hoverScale);
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

        if (this.view.mobile && this.viewport.dataset.seatLabelMode === 'overview') return;

        // Use the rounded backrest's exact local centre as the anchor. Desktop
        // follows the row curve; mobile keeps labels upright so small numbers
        // remain aligned and legible while the surface is being transformed.
        context.save();
        context.translate(seat.centerX, seat.centerY);
        if (!this.view.mobile) context.rotate(seat.rotation);
        context.fillStyle = text;
        const mobileFontSize = Math.min(11, Math.max(8, 7 / Math.max(0.62, this.view.scale)));
        const fontSize = theme.readable ? 9 :
            (this.view.mobile ? mobileFontSize : (seat.kind === 'wheelchair' ? 10 : 8));
        context.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        const metrics = context.measureText(label);
        const placement = centerTextMetricsInRectangle(metrics, {
            x: -seat.width * hoverScale / 2,
            y: -seat.height * hoverScale / 2,
            width: seat.width * hoverScale,
            height: backHeight * hoverScale
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
        if (event.pointerType === 'touch' && this.activePointers.has(event.pointerId)) {
            this._handleTouchMove(event);
            return;
        }
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
        if (event.pointerType === 'touch' && this.view.mobile) {
            this._handleTouchDown(event);
            return;
        }
        if (event.button !== 0) return;
        const point = canvasPoint(this.canvas, event);
        this.drag = { startX: point.x, startY: point.y, endX: point.x, endY: point.y, active: false };
        this.canvas.setPointerCapture(event.pointerId);
    }

    _handlePointerUp(event) {
        if (event.pointerType === 'touch' && this.activePointers.has(event.pointerId)) {
            this._handleTouchEnd(event);
            return;
        }
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

    _pointerInViewport(event) {
        const bounds = this.viewport.getBoundingClientRect();
        return {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top
        };
    }

    _handleTouchDown(event) {
        this._stopViewAnimation();
        const point = this._pointerInViewport(event);
        this.activePointers.set(event.pointerId, point);
        this.canvas.setPointerCapture(event.pointerId);

        if (this.activePointers.size >= 2) {
            const [left, right] = [...this.activePointers.values()].slice(0, 2);
            const midpoint = pointerMidpoint(left, right);
            this.pinch = {
                distance: Math.max(1, pointerDistance(left, right)),
                scale: this.view.scale,
                anchorX: (midpoint.x - this.view.panX) / this.view.scale,
                anchorY: (midpoint.y - this.view.panY) / this.view.scale
            };
            this.touchPan = null;
            this.suppressNextClick = true;
            event.preventDefault();
            return;
        }

        if (this.view.scale > this.view.minScale + 0.035) {
            this.touchPan = {
                pointerId: event.pointerId,
                startX: point.x,
                startY: point.y,
                panX: this.view.panX,
                panY: this.view.panY,
                active: false
            };
        }
    }

    _handleTouchMove(event) {
        const point = this._pointerInViewport(event);
        this.activePointers.set(event.pointerId, point);

        if (this.activePointers.size >= 2 && this.pinch) {
            const [left, right] = [...this.activePointers.values()].slice(0, 2);
            const midpoint = pointerMidpoint(left, right);
            const nextScale = this.pinch.scale *
                (pointerDistance(left, right) / this.pinch.distance);
            const next = this._constrainView({
                scale: nextScale,
                panX: midpoint.x - this.pinch.anchorX * nextScale,
                panY: midpoint.y - this.pinch.anchorY * nextScale
            }, { resist: true });
            Object.assign(this.view, next);
            this._applyViewTransform();
            this.suppressNextClick = true;
            event.preventDefault();
            return;
        }

        if (!this.touchPan || this.touchPan.pointerId !== event.pointerId) return;
        const deltaX = point.x - this.touchPan.startX;
        const deltaY = point.y - this.touchPan.startY;
        if (!this.touchPan.active && Math.hypot(deltaX, deltaY) >= PAN_THRESHOLD) {
            this.touchPan.active = true;
            this.suppressNextClick = true;
        }
        if (!this.touchPan.active) return;
        const next = this._constrainView({
            ...this.view,
            panX: this.touchPan.panX + deltaX,
            panY: this.touchPan.panY + deltaY
        }, { resist: true });
        Object.assign(this.view, next);
        this._applyViewTransform({ renderLabels: false });
        event.preventDefault();
    }

    _handleTouchEnd(event) {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
        }
        this.activePointers.delete(event.pointerId);

        if (this.activePointers.size === 1 && this.pinch) {
            const [pointerId, point] = [...this.activePointers.entries()][0];
            this.pinch = null;
            this.touchPan = this.view.scale > this.view.minScale + 0.035 ? {
                pointerId,
                startX: point.x,
                startY: point.y,
                panX: this.view.panX,
                panY: this.view.panY,
                active: true
            } : null;
            return;
        }

        if (this.activePointers.size === 0) {
            this.pinch = null;
            this.touchPan = null;
            const target = this._constrainView(this.view);
            this._animateViewTo(target);
        }
    }

    _handlePointerCancel(event) {
        if (event.pointerType === 'touch') {
            this.activePointers.delete(event.pointerId);
            if (this.activePointers.size === 0) {
                this.pinch = null;
                this.touchPan = null;
                this._animateViewTo(this._constrainView(this.view));
            }
            return;
        }
        this._cancelDrag();
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
        this._revealSeat(target.id);
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
        if (this.lastCenteredAuditoriumId === auditoriumId) return;
        this.lastCenteredAuditoriumId = auditoriumId;
        requestAnimationFrame(() => {
            this.scroller.scrollLeft = Math.max(0, (this.scroller.scrollWidth - this.scroller.clientWidth) / 2);
        });
    }
}

export default CommercialSeatMapController;
