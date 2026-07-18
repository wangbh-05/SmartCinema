import { createBrowserCommercialApplication } from './bootstrapCommercial.js';
import { AuthViewAdapter } from './ui/adapters/AuthViewAdapter.js';
import { DialogController } from './ui/components/DialogController.js';
import { AuthDialogController } from './ui/controllers/AuthDialogController.js';
import { CommercialOrdersController } from './ui/controllers/CommercialOrdersController.js';
import {
    appendText,
    formatAmount,
    formatDate,
    formatMoney,
    formatTime
} from './ui/commercial/CommerceView.js';

function element(id) {
    return document.getElementById(id);
}

function seatStatusLabel(seat, selected, sold, held) {
    if (selected) return '已选';
    if (sold) return '已售';
    if (held) return '已被其他观众锁定';
    if (seat.kind === 'wheelchair') return '可选轮椅位';
    if (seat.kind === 'companion') return '可选陪同席';
    if (seat.zoneId === 'preferred') return '可选优选区座位';
    return '可选';
}

class CommercialBookingPage {
    constructor(app) {
        this.app = app;
        this.booking = app.booking;
        this.context = null;
        this.showtimes = [];
        this.inventory = null;
        this.draft = null;
        this.quote = null;
        this.ticketQuantities = new Map([['adult', 2]]);
        this.preferences = new Set(['center']);
        this.activeHold = null;
        this.holdOwnerId = null;
        this.confirmedOrder = null;
        this.holdTimer = null;
        this.toastTimer = null;
        this.pendingOrdersOpen = false;
        this.lastFocusedSeatId = null;
    }

    start() {
        const initialized = this.app.initialize();
        if (!initialized.ok) {
            this.renderFatalError(initialized.error.message);
            return;
        }
        this.setupDialogs();
        this.bindStaticEvents();
        this.updateAccountHeader();

        const showtimes = this.booking.listShowtimes();
        if (!showtimes.ok || showtimes.value.length === 0) {
            this.renderFatalError(showtimes.error?.message || '当前没有可购买的场次');
            return;
        }
        this.showtimes = showtimes.value;
        const now = Date.parse(this.app.clock.now());
        const initial = this.showtimes.find(item => Date.parse(item.showtime.bookingClosesAt) > now) ||
            this.showtimes[this.showtimes.length - 1];
        this.restoreBookingSession(initial.showtime.id);
    }

    setupDialogs() {
        const authAdapter = new AuthViewAdapter(this.app.account);
        this.authDialog = new AuthDialogController({
            auth: authAdapter,
            onAuthChanged: () => this.handleAuthChanged(),
            onAnnounce: message => this.announce(message),
            onNotify: message => this.notify(message)
        });

        const checkoutOverlay = element('checkout-dialog');
        this.checkoutDialog = new DialogController({
            overlay: checkoutOverlay,
            dialog: checkoutOverlay.querySelector('.checkout-dialog'),
            closeButton: element('checkout-close'),
            canCloseFromBackdrop: () => {
                this.notify('请使用右上角关闭按钮或“返回改座”');
                return false;
            },
            onClose: () => this.handleCheckoutClosed()
        });

        this.ordersController = new CommercialOrdersController({
            booking: this.booking,
            account: this.app.account,
            onNotify: message => this.notify(message),
            onAnnounce: message => this.announce(message),
            onInventoryChanged: showtimeId => {
                if (showtimeId === this.context?.showtime.id) this.refreshInventory();
            }
        });
    }

    bindStaticEvents() {
        element('btn-login').addEventListener('click', event => this.authDialog.open('login', event.currentTarget));
        element('btn-register').addEventListener('click', event => this.authDialog.open('register', event.currentTarget));
        element('btn-logout').addEventListener('click', () => {
            const result = this.app.account.logout();
            if (!result.ok) return this.notify(result.error.message);
            this.updateAccountHeader();
            this.renderCheckout();
            this.notify('已退出登录');
        });
        element('btn-orders').addEventListener('click', event => this.openOrders(event.currentTarget));
        element('showtime-list').addEventListener('click', event => {
            const button = event.target.closest('[data-showtime-id]');
            if (button && !button.disabled) this.selectShowtime(button.dataset.showtimeId);
        });
        element('ticket-list').addEventListener('click', event => {
            const button = event.target.closest('[data-ticket-action]');
            if (button) this.changeTicketQuantity(button.dataset.ticketTypeId, button.dataset.ticketAction);
        });
        element('preference-chips').addEventListener('click', event => {
            const button = event.target.closest('[data-preference]');
            if (button) this.togglePreference(button.dataset.preference, button);
        });
        element('recommend-seats').addEventListener('click', () => this.recommendSeats());
        element('seat-map').addEventListener('click', event => {
            const button = event.target.closest('[data-seat-id]');
            if (button && !button.disabled) this.toggleSeat(button.dataset.seatId);
        });
        element('seat-map').addEventListener('keydown', event => this.handleSeatKeydown(event));
        element('accessible-acknowledgement').addEventListener('change', event => {
            this.rebuildDraft({
                preserveSeats: true,
                accessibilityAcknowledged: event.currentTarget.checked
            });
        });
        element('continue-booking').addEventListener('click', event => this.placeHold(event.currentTarget));
        element('mobile-continue').addEventListener('click', event => this.placeHold(event.currentTarget));
    }

    restoreBookingSession(fallbackShowtimeId) {
        const savedDraft = this.app.bookingDrafts.get();
        if (!savedDraft.ok) {
            this.app.bookingDrafts.clear();
            this.notify('上次选座草稿无法恢复，已为你重新开始');
        }
        const active = this.booking.findActiveHold(this.app.getBookingOwnerIds());
        if (!active.ok) {
            this.notify(active.error.message);
        } else if (active.value) {
            const hold = active.value;
            const matchingDraft = savedDraft.ok && savedDraft.value?.showtimeId === hold.showtimeId ?
                savedDraft.value : null;
            this.setTicketItems(hold.ticketItems);
            this.preferences = new Set(matchingDraft?.preferences || ['center']);
            const context = this.booking.getBookingContext(hold.showtimeId);
            const hasAccessibleSeat = context.ok && context.value.auditorium.seats.some(seat =>
                hold.seatIds.includes(seat.id) && ['wheelchair', 'companion'].includes(seat.kind)
            );
            const restoredDraft = {
                showtimeId: hold.showtimeId,
                ticketItems: hold.ticketItems,
                selectedSeatIds: hold.seatIds,
                preferences: [...this.preferences],
                accessibilityAcknowledged: hasAccessibleSeat || Boolean(matchingDraft?.accessibilityAcknowledged)
            };
            const restored = this.selectShowtime(hold.showtimeId, {
                announce: false,
                restoredDraft,
                allowHoldId: hold.id,
                persist: false
            });
            if (restored) {
                this.activeHold = hold;
                this.holdOwnerId = hold.ownerId;
                this.quote = hold.pricingQuote;
                this.persistDraft();
                this.renderSummary();
                this.renderCheckout();
                this.checkoutDialog.open();
                this.startHoldTimer();
                this.announce('已恢复仍在保留时间内的座位');
                return;
            }
        }

        const draft = savedDraft.ok ? savedDraft.value : null;
        const draftShowtime = draft && this.showtimes.some(item =>
            item.showtime.id === draft.showtimeId &&
            Date.parse(item.showtime.bookingClosesAt) > Date.parse(this.app.clock.now())
        ) ? draft.showtimeId : fallbackShowtimeId;
        if (draft && draftShowtime === draft.showtimeId) {
            this.setTicketItems(draft.ticketItems);
            this.preferences = new Set(draft.preferences);
        }
        this.selectShowtime(draftShowtime, {
            announce: false,
            restoredDraft: draftShowtime === draft?.showtimeId ? draft : null
        });
    }

    setTicketItems(ticketItems) {
        this.ticketQuantities = new Map(
            ticketItems.map(item => [item.ticketTypeId, item.quantity])
        );
    }

    selectShowtime(showtimeId, {
        announce = true,
        restoredDraft = null,
        allowHoldId = null,
        persist = true
    } = {}) {
        if (this.context?.showtime.id === showtimeId) return;
        const context = this.booking.getBookingContext(showtimeId);
        if (!context.ok) {
            this.notify(context.error.message);
            return false;
        }
        const inventory = this.booking.getInventory(showtimeId);
        if (!inventory.ok) {
            this.notify(inventory.error.message);
            return false;
        }
        const draft = this.booking.createDraft({
            showtimeId,
            ticketItems: this.ticketItems(),
            preferences: [...this.preferences],
            accessibilityAcknowledged: Boolean(restoredDraft?.accessibilityAcknowledged)
        });
        if (!draft.ok) {
            this.notify(draft.error.message);
            return false;
        }
        this.context = context.value;
        this.inventory = inventory.value;
        const knownSeatIds = new Set(this.context.auditorium.seats.map(seat => seat.id));
        const restoredSeatIds = (restoredDraft?.selectedSeatIds || []).filter(seatId =>
            knownSeatIds.has(seatId) &&
            !this.inventory.soldSeatIds.includes(seatId) &&
            (!this.inventory.holdIdsBySeatId[seatId] || this.inventory.holdIdsBySeatId[seatId] === allowHoldId)
        );
        const replaced = restoredSeatIds.length > 0 ?
            this.booking.replaceSeats(draft.value, restoredSeatIds) : null;
        this.draft = replaced?.ok ? replaced.value : draft.value;
        this.quote = null;
        this.lastFocusedSeatId = null;
        this.updateQuote();
        this.renderAll();
        if (persist) this.persistDraft();
        if (restoredDraft && restoredSeatIds.length < restoredDraft.selectedSeatIds.length) {
            this.notify('部分座位已不可用，已保留仍可选择的座位');
        }
        if (announce) {
            this.announce(`已切换到 ${formatTime(this.context.showtime.startsAt)} 场次`);
        }
        return true;
    }

    ticketItems() {
        return [...this.ticketQuantities.entries()]
            .filter(([, quantity]) => quantity > 0)
            .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    }

    get ticketCount() {
        return this.ticketItems().reduce((total, item) => total + item.quantity, 0);
    }

    changeTicketQuantity(ticketTypeId, action) {
        const current = this.ticketQuantities.get(ticketTypeId) || 0;
        const next = action === 'increase' ? current + 1 : current - 1;
        const nextTotal = this.ticketCount - current + next;
        if (next < 0 || nextTotal < 1 || nextTotal > 8) return;
        const hadSeats = this.draft.selectedSeatIds.length > 0;
        this.ticketQuantities.set(ticketTypeId, next);
        this.rebuildDraft({ preserveSeats: false });
        if (hadSeats) this.notify('票数已变化，请重新选择对应数量的座位');
    }

    togglePreference(preference, button) {
        if (this.preferences.has(preference)) this.preferences.delete(preference);
        else this.preferences.add(preference);
        button.setAttribute('aria-pressed', String(this.preferences.has(preference)));
        this.rebuildDraft({ preserveSeats: true });
    }

    rebuildDraft({
        preserveSeats,
        accessibilityAcknowledged = this.draft.accessibilityAcknowledged,
        persist = true
    }) {
        const selectedSeatIds = preserveSeats ? [...this.draft.selectedSeatIds] : [];
        const next = this.booking.createDraft({
            showtimeId: this.context.showtime.id,
            ticketItems: this.ticketItems(),
            preferences: [...this.preferences],
            accessibilityAcknowledged
        });
        if (!next.ok) return this.notify(next.error.message);
        let draft = next.value;
        if (selectedSeatIds.length > 0 && selectedSeatIds.length <= draft.ticketCount) {
            const replaced = this.booking.replaceSeats(draft, selectedSeatIds);
            if (replaced.ok) draft = replaced.value;
        }
        this.draft = draft;
        this.updateQuote();
        this.renderTickets();
        this.renderSeatMap();
        this.renderSummary();
        if (persist) this.persistDraft();
    }

    persistDraft() {
        if (!this.draft) return;
        const saved = this.app.bookingDrafts.save(this.draft);
        if (!saved.ok) this.notify(saved.error.message);
    }

    toggleSeat(seatId) {
        const selected = new Set(this.draft.selectedSeatIds);
        const seat = this.context.auditorium.seats.find(item => item.id === seatId);
        if (!seat) return;
        this.lastFocusedSeatId = seatId;

        if (selected.has(seatId)) {
            selected.delete(seatId);
            if (seat.kind === 'wheelchair') {
                const companion = this.context.auditorium.seats.find(item =>
                    item.kind === 'companion' && item.companionForSeatId === seat.id
                );
                if (companion) selected.delete(companion.id);
            }
        } else {
            const selectedSeats = [...selected].map(id =>
                this.context.auditorium.seats.find(item => item.id === id)
            );
            if (selectedSeats.length > 0 && selectedSeats.some(item => item.sectionId !== seat.sectionId)) {
                this.notify('同一订单请选择同一区块的座位，避免跨过道分散');
                return;
            }
            if (seat.kind === 'companion' && !selected.has(seat.companionForSeatId)) {
                if (selected.size + 2 > this.draft.ticketCount || this.isSeatUnavailable(seat.companionForSeatId)) {
                    this.notify('陪同席需和对应轮椅位一起选择，并占用 2 张票');
                    return;
                }
                selected.add(seat.companionForSeatId);
            }
            if (selected.size >= this.draft.ticketCount) {
                this.notify(`本单有 ${this.draft.ticketCount} 张票；请先取消一个座位再更换`);
                return;
            }
            selected.add(seatId);
        }

        const replaced = this.booking.replaceSeats(this.draft, [...selected]);
        if (!replaced.ok) return this.notify(replaced.error.message);
        this.draft = replaced.value;
        this.updateQuote();
        this.renderSeatMap();
        this.renderSummary();
        this.persistDraft();
        this.announce(`${seat.label}${selected.has(seatId) ? '已选择' : '已取消'}`);
    }

    recommendSeats() {
        const result = this.booking.recommendSeats(this.draft);
        if (!result.ok) return this.notify(result.error.message);
        this.draft = result.value.draft;
        this.lastFocusedSeatId = this.draft.selectedSeatIds[0];
        this.updateQuote();
        this.renderSeatMap({ focusSeat: true });
        this.renderSummary();
        this.persistDraft();
        this.notify(result.value.reason);
        this.announce(`已推荐 ${result.value.seats.map(seat => seat.label).join('、')}`);
    }

    updateQuote() {
        this.quote = null;
        if (this.draft.selectedSeatIds.length !== this.draft.ticketCount) return;
        const quoted = this.booking.quoteDraft(this.draft);
        if (quoted.ok) this.quote = quoted.value;
    }

    isSeatUnavailable(seatId) {
        return this.inventory.soldSeatIds.includes(seatId) || Boolean(this.inventory.holdIdsBySeatId[seatId]);
    }

    renderAll() {
        this.renderContext();
        this.renderShowtimes();
        this.renderTickets();
        this.renderSeatMap();
        this.renderSummary();
    }

    renderContext() {
        const { movie, cinema, auditorium, showtime, refundPolicy } = this.context;
        element('movie-title').textContent = movie.title;
        element('movie-original').textContent = movie.originalTitle;
        element('movie-synopsis').textContent = movie.synopsis;
        const meta = element('movie-meta');
        meta.replaceChildren();
        [...movie.genres, `${movie.durationMinutes} 分钟`, movie.audienceRating].forEach(value =>
            appendText(meta, 'span', value)
        );
        element('cinema-name').textContent = cinema.name;
        element('cinema-address').textContent = cinema.address;
        element('showtime-date').textContent = formatDate(showtime.startsAt);
        element('auditorium-name').textContent = auditorium.name;
        element('showtime-format').textContent = `${showtime.format} · ${showtime.language}`;
        element('refund-note').textContent = refundPolicy.summary;
        element('summary-time').textContent = formatTime(showtime.startsAt);
        element('summary-date').textContent = formatDate(showtime.startsAt);
        element('summary-auditorium').textContent = `${auditorium.name} · ${showtime.format}`;
    }

    renderShowtimes() {
        const list = element('showtime-list');
        list.replaceChildren();
        const now = Date.parse(this.app.clock.now());
        this.showtimes.forEach(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'showtime-option';
            button.dataset.showtimeId = item.showtime.id;
            button.setAttribute('role', 'listitem');
            button.setAttribute('aria-pressed', String(item.showtime.id === this.context.showtime.id));
            button.disabled = Date.parse(item.showtime.bookingClosesAt) <= now;
            appendText(button, 'strong', formatTime(item.showtime.startsAt));
            appendText(button, 'small', `${item.showtime.format} · ${item.showtime.language}`);
            appendText(button, 'span', button.disabled ? '已停售' : `${formatAmount(item.priceFrom)}起`, 'showtime-price');
            list.append(button);
        });
    }

    renderTickets() {
        const list = element('ticket-list');
        list.replaceChildren();
        this.context.ticketTypes.forEach(ticketType => {
            const quantity = this.ticketQuantities.get(ticketType.id) || 0;
            const item = document.createElement('article');
            item.className = 'ticket-option';
            const copy = document.createElement('div');
            copy.className = 'ticket-copy';
            appendText(copy, 'strong', ticketType.label);
            appendText(copy, 'span', `${ticketType.description} · ${formatAmount(
                this.context.pricingPolicy.baseTicketPrice + ticketType.priceAdjustment,
                this.context.pricingPolicy.currency
            )}`);
            if (ticketType.eligibilityNote) appendText(copy, 'small', ticketType.eligibilityNote);

            const stepper = document.createElement('div');
            stepper.className = 'ticket-stepper';
            stepper.setAttribute('role', 'group');
            stepper.setAttribute('aria-label', `${ticketType.label}数量`);
            const decrease = document.createElement('button');
            decrease.type = 'button';
            decrease.textContent = '−';
            decrease.dataset.ticketAction = 'decrease';
            decrease.dataset.ticketTypeId = ticketType.id;
            decrease.disabled = quantity === 0 || this.ticketCount === 1;
            decrease.setAttribute('aria-label', `减少${ticketType.label}`);
            const output = document.createElement('output');
            output.textContent = String(quantity);
            output.setAttribute('aria-label', `${quantity} 张`);
            const increase = document.createElement('button');
            increase.type = 'button';
            increase.textContent = '+';
            increase.dataset.ticketAction = 'increase';
            increase.dataset.ticketTypeId = ticketType.id;
            increase.disabled = this.ticketCount >= 8;
            increase.setAttribute('aria-label', `增加${ticketType.label}`);
            stepper.append(decrease, output, increase);
            item.append(copy, stepper);
            list.append(item);
        });
    }

    renderSeatMap({ focusSeat = false } = {}) {
        const map = element('seat-map');
        const activeSeatId = document.activeElement?.dataset?.seatId || null;
        const previousFocus = activeSeatId || this.lastFocusedSeatId;
        const selected = new Set(this.draft.selectedSeatIds);
        const sold = new Set(this.inventory.soldSeatIds);
        const held = new Set(Object.keys(this.inventory.holdIdsBySeatId));
        const rows = new Map();
        this.context.auditorium.seats.forEach(seat => {
            if (!rows.has(seat.rowIndex)) rows.set(seat.rowIndex, []);
            rows.get(seat.rowIndex).push(seat);
        });
        map.replaceChildren();
        let firstAvailableId = null;
        [...rows.entries()].sort(([left], [right]) => left - right).forEach(([, seats]) => {
            const row = document.createElement('div');
            row.className = 'seat-row';
            const label = appendText(row, 'span', seats[0].rowLabel, 'seat-row-label');
            label.setAttribute('aria-hidden', 'true');
            seats.sort((left, right) => left.columnIndex - right.columnIndex).forEach(seat => {
                const isSold = sold.has(seat.id);
                const isHeld = held.has(seat.id);
                const isSelected = selected.has(seat.id);
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
                button.disabled = isSold || isHeld;
                button.setAttribute('aria-pressed', String(isSelected));
                button.setAttribute(
                    'aria-label',
                    `${seat.label}，${seat.zoneId === 'preferred' ?
                        `座位附加费${formatAmount(this.context.pricingPolicy.seatZoneSurcharges[seat.zoneId])}` :
                        '无座位附加费'}，${seatStatusLabel(seat, isSelected, isSold, isHeld)}`
                );
                button.textContent = seat.kind === 'wheelchair' ? '♿' :
                    (seat.kind === 'companion' ? '陪' : String(seat.seatNumber));
                if (!button.disabled && firstAvailableId === null) firstAvailableId = seat.id;
                button.tabIndex = -1;
                row.append(button);
            });
            map.append(row);
        });

        const focusId = previousFocus && map.querySelector(`[data-seat-id="${previousFocus}"]:not(:disabled)`) ?
            previousFocus : (this.draft.selectedSeatIds[0] || firstAvailableId);
        const focusTarget = focusId ? map.querySelector(`[data-seat-id="${focusId}"]`) : null;
        if (focusTarget) focusTarget.tabIndex = 0;
        if (activeSeatId && !focusSeat && focusTarget) {
            focusTarget.focus({ preventScroll: true });
        } else if (focusSeat && focusTarget) {
            requestAnimationFrame(() => {
                const scroller = element('seat-scroll');
                scroller.scrollLeft = Math.max(0, focusTarget.offsetLeft - scroller.clientWidth / 2);
                focusTarget.focus({ preventScroll: true });
            });
        }

        const accessibleSelected = this.context.auditorium.seats.some(seat =>
            selected.has(seat.id) && ['wheelchair', 'companion'].includes(seat.kind)
        );
        element('accessible-confirm').hidden = !accessibleSelected;
        element('accessible-acknowledgement').checked = this.draft.accessibilityAcknowledged;
        element('selected-progress').textContent = `${selected.size} / ${this.draft.ticketCount}`;
    }

    handleSeatKeydown(event) {
        const current = event.target.closest('[data-seat-id]');
        if (!current) return;
        if ([' ', 'Space', 'Spacebar'].includes(event.key)) {
            event.preventDefault();
            current.click();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...element('seat-map').querySelectorAll('[data-seat-id]:not(:disabled)')];
        const row = Number(current.dataset.row);
        const column = Number(current.dataset.column);
        let candidates;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            candidates = buttons.filter(button => Number(button.dataset.row) === row);
            candidates.sort((left, right) => Number(left.dataset.column) - Number(right.dataset.column));
            const index = candidates.indexOf(current);
            const offset = event.key === 'ArrowLeft' ? -1 : 1;
            candidates = [candidates[index + offset]].filter(Boolean);
        } else {
            const direction = event.key === 'ArrowUp' ? -1 : 1;
            candidates = buttons
                .filter(button => (Number(button.dataset.row) - row) * direction > 0)
                .sort((left, right) => {
                    const leftRowDistance = Math.abs(Number(left.dataset.row) - row);
                    const rightRowDistance = Math.abs(Number(right.dataset.row) - row);
                    if (leftRowDistance !== rightRowDistance) return leftRowDistance - rightRowDistance;
                    return Math.abs(Number(left.dataset.column) - column) -
                        Math.abs(Number(right.dataset.column) - column);
                });
        }
        const target = candidates[0];
        if (!target) return;
        current.tabIndex = -1;
        target.tabIndex = 0;
        this.lastFocusedSeatId = target.dataset.seatId;
        target.focus();
    }

    renderSummary() {
        const selectedSeats = this.draft.selectedSeatIds.map(id =>
            this.context.auditorium.seats.find(seat => seat.id === id)
        ).filter(Boolean);
        const missing = this.draft.ticketCount - selectedSeats.length;
        element('summary-ticket-count').textContent = `${this.draft.ticketCount} 张`;
        const seatList = element('selected-seat-list');
        seatList.replaceChildren();
        if (selectedSeats.length === 0) {
            appendText(seatList, 'p', `还需选择 ${missing} 个座位`);
        } else {
            selectedSeats.forEach(seat => appendText(seatList, 'span', seat.label, 'seat-chip'));
            if (missing > 0) appendText(seatList, 'p', `还需 ${missing} 个`);
        }

        const breakdown = element('price-breakdown');
        breakdown.replaceChildren();
        if (this.quote) {
            this.quote.ticketLines.forEach(line => {
                const row = document.createElement('div');
                appendText(row, 'span', `${line.label} × ${line.quantity}`);
                appendText(row, 'span', formatMoney(line.amount));
                breakdown.append(row);
            });
            if (this.quote.seatSurcharge.amount > 0) {
                const row = document.createElement('div');
                appendText(row, 'span', '优选座位附加费');
                appendText(row, 'span', formatMoney(this.quote.seatSurcharge));
                breakdown.append(row);
            }
            const fee = document.createElement('div');
            appendText(fee, 'span', '购票服务费');
            appendText(fee, 'span', formatMoney(this.quote.serviceFee));
            breakdown.append(fee);
        } else {
            const row = document.createElement('div');
            appendText(row, 'span', '票价与服务费');
            appendText(row, 'span', '选满座位后显示');
            breakdown.append(row);
        }

        const requiresAccessibilityAcknowledgement = selectedSeats.some(seat =>
            ['wheelchair', 'companion'].includes(seat.kind)
        ) && !this.draft.accessibilityAcknowledged;
        const ready = Boolean(this.quote) && missing === 0 && !requiresAccessibilityAcknowledgement;
        element('summary-total').textContent = this.quote ? formatMoney(this.quote.total) : '—';
        const continueButton = element('continue-booking');
        continueButton.disabled = !ready;
        continueButton.querySelector('span').textContent = ready ? '锁定座位并继续' :
            (requiresAccessibilityAcknowledgement ? '请确认无障碍席位' : `还需选择 ${missing} 个座位`);
        element('mobile-seat-count').textContent = `已选 ${selectedSeats.length} / ${this.draft.ticketCount}`;
        element('mobile-total').textContent = this.quote ? formatMoney(this.quote.total) : '—';
        const mobileButton = element('mobile-continue');
        mobileButton.disabled = !ready;
        mobileButton.textContent = ready ? '锁定座位' :
            (requiresAccessibilityAcknowledgement ? '请确认席位' : '请先选座');
    }

    placeHold(trigger) {
        if (!this.quote || this.activeHold) return;
        const ownerId = this.app.getBookingOwnerId();
        const result = this.booking.placeHold({
            draft: this.draft,
            ownerId,
            idempotencyKey: this.booking.createHoldRequestKey(),
            holdDurationSeconds: 600
        });
        if (!result.ok) {
            this.refreshInventory();
            if (result.error.code === 'ACCESSIBLE_SEAT_ACKNOWLEDGEMENT_REQUIRED') {
                element('accessible-confirm').hidden = false;
                element('accessible-acknowledgement').focus();
            }
            return this.notify(result.error.message);
        }
        this.activeHold = result.value.hold;
        this.holdOwnerId = ownerId;
        this.confirmedOrder = null;
        this.renderCheckout();
        this.checkoutDialog.open({ trigger });
        this.startHoldTimer();
        this.announce('座位已保留 10 分钟，请确认订单');
    }

    renderCheckout() {
        if (!this.activeHold && !this.confirmedOrder) return;
        const content = element('checkout-content');
        content.replaceChildren();
        if (this.confirmedOrder) {
            this.renderOrderSuccess(content, this.confirmedOrder);
            return;
        }
        const hold = this.activeHold;
        const hero = document.createElement('div');
        hero.className = 'checkout-hero';
        appendText(hero, 'p', '订单确认', 'dialog-eyebrow');
        appendText(hero, 'h2', '座位已为你保留');
        const timer = appendText(hero, 'div', '剩余 10:00', 'checkout-timer');
        timer.id = 'hold-countdown';
        content.append(hero);

        const details = document.createElement('div');
        details.className = 'checkout-details';
        this.appendCheckoutRow(details, '影片', this.context.movie.title);
        this.appendCheckoutRow(
            details,
            '场次',
            `${formatDate(this.context.showtime.startsAt)} ${formatTime(this.context.showtime.startsAt)}`
        );
        this.appendCheckoutRow(details, '影厅', this.context.auditorium.name);
        const seatLabels = hold.seatIds.map(id =>
            this.context.auditorium.seats.find(seat => seat.id === id)?.label || id
        );
        this.appendCheckoutRow(details, '座位', seatLabels.join('、'));
        const total = document.createElement('div');
        total.className = 'checkout-detail-row checkout-total';
        appendText(total, 'span', '应付合计');
        appendText(total, 'strong', formatMoney(hold.pricingQuote.total));
        details.append(total);
        content.append(details);

        const user = this.app.account.getCurrentUser();
        const note = appendText(
            content,
            'p',
            user ? `订单将保存到 ${user.name} 的账户` : '无需登录即可锁座；确认订单前需要登录或注册。',
            'checkout-account-note'
        );
        note.id = 'checkout-account-note';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'primary-action';
        confirm.id = 'confirm-order';
        confirm.textContent = user ? `确认订单 · ${formatMoney(hold.pricingQuote.total)}` : '登录后确认订单';
        confirm.addEventListener('click', event => {
            if (!this.app.account.isLoggedIn()) {
                this.authDialog.open('login', event.currentTarget);
                return;
            }
            this.confirmOrder();
        });
        content.append(confirm);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'text-action checkout-secondary';
        back.textContent = '返回重新选座';
        back.addEventListener('click', () => this.checkoutDialog.close());
        content.append(back);
        this.updateHoldCountdown();
    }

    appendCheckoutRow(parent, label, value) {
        const row = document.createElement('div');
        row.className = 'checkout-detail-row';
        appendText(row, 'span', label);
        appendText(row, 'strong', value);
        parent.append(row);
    }

    confirmOrder() {
        const user = this.app.account.getCurrentUser();
        if (!user || !this.activeHold) return;
        const result = this.booking.confirmHold({
            holdId: this.activeHold.id,
            actorOwnerId: this.holdOwnerId,
            userId: user.id
        });
        if (!result.ok) return this.notify(result.error.message);
        this.confirmedOrder = result.value.order;
        this.activeHold = null;
        this.app.bookingDrafts.clear();
        this.stopHoldTimer();
        this.refreshInventory();
        this.renderCheckout();
        this.announce(`订单确认成功，取票码 ${this.confirmedOrder.ticketCode}`);
    }

    renderOrderSuccess(content, order) {
        const wrapper = document.createElement('div');
        wrapper.className = 'success-ticket';
        appendText(wrapper, 'div', '✓', 'success-icon');
        appendText(wrapper, 'p', '订单已确认', 'dialog-eyebrow');
        appendText(wrapper, 'h2', '购票成功');
        appendText(
            wrapper,
            'p',
            `${order.movieSnapshot.title} · ${formatDate(order.showtimeSnapshot.startsAt)} ${formatTime(order.showtimeSnapshot.startsAt)}`
        );
        const code = document.createElement('div');
        code.className = 'ticket-code';
        appendText(code, 'span', '电子取票码');
        appendText(code, 'strong', order.ticketCode);
        wrapper.append(code);
        const seats = order.seatSnapshots.map(seat => seat.label).join('、');
        appendText(wrapper, 'p', `${order.auditoriumSnapshot.name} · ${seats}`);
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'primary-action';
        done.textContent = '完成';
        done.addEventListener('click', () => this.checkoutDialog.close());
        wrapper.append(done);
        content.append(wrapper);
    }

    startHoldTimer() {
        this.stopHoldTimer();
        this.updateHoldCountdown();
        this.holdTimer = window.setInterval(() => this.updateHoldCountdown(), 1000);
    }

    stopHoldTimer() {
        if (this.holdTimer !== null) window.clearInterval(this.holdTimer);
        this.holdTimer = null;
    }

    updateHoldCountdown() {
        if (!this.activeHold) return;
        const remaining = Math.max(0, Math.ceil(
            (Date.parse(this.activeHold.expiresAt) - Date.parse(this.app.clock.now())) / 1000
        ));
        const output = element('hold-countdown');
        if (output) {
            const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
            const seconds = String(remaining % 60).padStart(2, '0');
            output.textContent = `剩余 ${minutes}:${seconds}`;
        }
        if (remaining > 0) return;
        const expired = this.booking.expireHold(this.activeHold.id);
        this.activeHold = null;
        this.stopHoldTimer();
        if (expired.ok) this.refreshInventory();
        const content = element('checkout-content');
        content.replaceChildren();
        appendText(content, 'p', '锁座已结束', 'dialog-eyebrow');
        appendText(content, 'h2', '保留时间已到');
        appendText(content, 'p', '座位已释放，请返回座位图重新选择。', 'dialog-intro');
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'primary-action';
        back.textContent = '返回选座';
        back.addEventListener('click', () => this.checkoutDialog.close());
        content.append(back);
        this.announce('座位保留已到期并释放');
    }

    handleCheckoutClosed() {
        this.stopHoldTimer();
        if (this.activeHold) {
            this.booking.releaseHold({
                holdId: this.activeHold.id,
                actorOwnerId: this.holdOwnerId,
                reason: 'change-seats'
            });
            this.activeHold = null;
            this.refreshInventory();
        }
        if (this.confirmedOrder) {
            this.confirmedOrder = null;
            this.rebuildDraft({ preserveSeats: false, persist: false });
            this.app.bookingDrafts.clear();
        }
        this.holdOwnerId = null;
    }

    refreshInventory() {
        const inventory = this.booking.getInventory(this.context.showtime.id);
        if (!inventory.ok) return;
        this.inventory = inventory.value;
        this.renderSeatMap();
        this.renderSummary();
    }

    handleAuthChanged() {
        this.updateAccountHeader();
        this.renderCheckout();
        if (this.checkoutDialog.isOpen()) {
            requestAnimationFrame(() => element('confirm-order')?.focus());
        }
        if (this.pendingOrdersOpen) {
            this.pendingOrdersOpen = false;
            this.openOrders(element('btn-orders'));
        }
    }

    updateAccountHeader() {
        const user = this.app.account.getCurrentUser();
        element('btn-login').hidden = Boolean(user);
        element('btn-register').hidden = Boolean(user);
        element('btn-logout').hidden = !user;
        element('user-info').hidden = !user;
        element('user-info').textContent = user ? `你好，${user.name}` : '';
    }

    openOrders(trigger) {
        const user = this.app.account.getCurrentUser();
        if (!user) {
            this.pendingOrdersOpen = true;
            this.notify('登录后可查看你的订单');
            this.authDialog.open('login', trigger);
            return;
        }
        this.ordersController.open(user, trigger);
    }

    notify(message) {
        const toast = element('toast');
        toast.textContent = message;
        toast.hidden = false;
        if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => {
            toast.hidden = true;
            this.toastTimer = null;
        }, 3200);
    }

    announce(message) {
        element('live-region').textContent = '';
        requestAnimationFrame(() => {
            element('live-region').textContent = message;
        });
    }

    renderFatalError(message) {
        const main = element('booking-main');
        main.replaceChildren();
        const state = document.createElement('section');
        state.className = 'booking-card';
        appendText(state, 'p', '无法启动购票流程', 'step-kicker');
        appendText(state, 'h1', '页面暂时不可用');
        appendText(state, 'p', message, 'dialog-intro');
        main.append(state);
    }
}

const page = new CommercialBookingPage(createBrowserCommercialApplication());
page.start();
