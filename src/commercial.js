import { createBrowserCommercialApplication } from './bootstrapCommercial.js';
import { AuthViewAdapter } from './ui/adapters/AuthViewAdapter.js';
import { AuthDialogController } from './ui/controllers/AuthDialogController.js';
import { CommercialCheckoutController } from './ui/controllers/CommercialCheckoutController.js';
import { CommercialCatalogController } from './ui/controllers/CommercialCatalogController.js';
import { CommercialDecisionSupportController } from './ui/controllers/CommercialDecisionSupportController.js';
import { CommercialOrdersController } from './ui/controllers/CommercialOrdersController.js';
import { CommercialPreferencesController } from './ui/controllers/CommercialPreferencesController.js';
import { CommercialSeatMapController } from './ui/controllers/CommercialSeatMapController.js';
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

class CommercialBookingPage {
    constructor(app) {
        this.app = app;
        this.booking = app.booking;
        this.ticketLimit = this.booking.getTicketLimit();
        this.context = null;
        this.allShowtimes = [];
        this.showtimes = [];
        this.inventory = null;
        this.draft = null;
        this.quote = null;
        this.ticketQuantities = new Map([['adult', 2]]);
        this.partyType = 'couple';
        this.preferences = new Set(['center']);
        this.showPopularity = false;
        this.heatPeriod = 'week';
        this.popularityBySeat = {};
        this.recommendedSeatIds = new Set();
        this.toastTimer = null;
        this.pendingOrdersOpen = false;
        this.posterRequestId = 0;
    }

    start() {
        const initialized = this.app.initialize();
        if (!initialized.ok) {
            this.renderFatalError(initialized.error.message);
            return;
        }
        this.setupDialogs();
        this.setupSeatMap();
        this.setupDecisionSupport();
        this.bindStaticEvents();
        this.updateAccountHeader();

        const navigation = this.booking.getCatalogNavigation();
        const showtimes = this.booking.listShowtimes();
        if (!navigation.ok || !showtimes.ok || showtimes.value.length === 0) {
            this.renderFatalError(
                navigation.error?.message || showtimes.error?.message || '当前没有可购买的场次'
            );
            return;
        }
        this.allShowtimes = showtimes.value;
        this.catalogController = new CommercialCatalogController({
            navigation: navigation.value,
            showtimes: this.allShowtimes,
            onSelect: selection => this.selectCatalogValue(selection)
        });
        const initial = this.allShowtimes.find(item => item.availability.bookable);
        if (!initial) {
            this.renderFatalError('未来三天暂时没有可购买的场次');
            return;
        }
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

        this.checkout = new CommercialCheckoutController({
            booking: this.booking,
            account: this.app.account,
            bookingDrafts: this.app.bookingDrafts,
            clock: this.app.clock,
            authDialog: this.authDialog,
            getContext: () => this.context,
            onNotify: message => this.notify(message),
            onAnnounce: message => this.announce(message),
            onInventoryChanged: () => this.refreshInventory(),
            onCheckoutCompleted: () => this.rebuildDraft({ preserveSeats: false, persist: false })
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
        this.preferencesController = new CommercialPreferencesController({
            preferences: this.app.preferences,
            account: this.app.account,
            onNotify: message => this.notify(message),
            onAnnounce: message => this.announce(message)
        });
    }

    setupSeatMap() {
        this.seatMap = new CommercialSeatMapController({
            map: element('seat-map'),
            scroller: element('seat-scroll'),
            surface: element('canvas-seat-surface'),
            canvas: element('seat-layout-canvas'),
            heatCanvas: element('seat-heat-canvas'),
            tooltip: element('canvas-seat-tooltip'),
            accessibleConfirm: element('accessible-confirm'),
            accessibleAcknowledgement: element('accessible-acknowledgement'),
            selectedProgress: element('selected-progress'),
            getState: () => ({
                context: this.context,
                draft: this.draft,
                inventory: this.inventory,
                popularityBySeat: this.popularityBySeat,
                showPopularity: this.showPopularity,
                heatPeriod: this.heatPeriod,
                recommendedSeatIds: [...this.recommendedSeatIds]
            }),
            onToggleSeat: seatId => this.toggleSeat(seatId),
            onSelectSeats: seatIds => this.selectSeatBlock(seatIds)
        });
    }

    setupDecisionSupport() {
        this.decisionSupport = new CommercialDecisionSupportController({
            booking: this.booking,
            onPartyTypeChange: partyType => this.changePartyType(partyType),
            onPopularityToggle: () => this.togglePopularity()
        });
    }

    bindStaticEvents() {
        element('btn-login').addEventListener('click', event => this.authDialog.open('login', event.currentTarget));
        element('btn-register').addEventListener('click', event => this.authDialog.open('register', event.currentTarget));
        element('btn-logout').addEventListener('click', () => {
            const result = this.app.account.logout();
            if (!result.ok) return this.notify(result.error.message);
            this.updateAccountHeader();
            this.preferencesController.refresh();
            this.checkout.refreshForAuth();
            this.notify('已退出登录');
        });
        element('btn-preferences').addEventListener('click', event =>
            this.preferencesController.open(event.currentTarget)
        );
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
        element('seat-conflict-recommend').addEventListener('click', () => this.recommendSeats());
        element('heat-period-controls').addEventListener('click', event => {
            const button = event.target.closest('[data-heat-period]');
            if (button) this.changeHeatPeriod(button.dataset.heatPeriod);
        });
        element('accessible-acknowledgement').addEventListener('change', event => {
            this.rebuildDraft({
                preserveSeats: true,
                accessibilityAcknowledged: event.currentTarget.checked
            });
        });
        element('continue-booking').addEventListener('click', event => this.placeHold(event.currentTarget));
        element('mobile-continue').addEventListener('click', event => this.placeHold(event.currentTarget));
    }

    selectCatalogValue({ type, value }) {
        if (this.checkout.isHolding()) {
            this.notify('请先完成或关闭当前锁座确认，再更换观影安排');
            return;
        }
        const selection = this.catalogSelection();
        const key = { movie: 'movieId', cinema: 'cinemaId', date: 'businessDate' }[type];
        if (!key || selection[key] === value) return;
        const candidate = this.catalogController.bestMatch(type, value, selection);
        if (!candidate) {
            this.notify('这个组合暂时没有可购买的场次');
            return;
        }
        const hadSeats = this.draft.selectedSeatIds.length > 0;
        if (!this.selectShowtime(candidate.showtime.id)) return;
        if (hadSeats) this.notify('观影安排已变化，原座位选择已清除');
        this.catalogController.focus(type, value);
    }

    catalogSelection() {
        return {
            movieId: this.context.movie.id,
            cinemaId: this.context.cinema.id,
            businessDate: this.context.showtime.startsAt.slice(0, 10)
        };
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
            this.setTicketItems(hold.ticketItems, matchingDraft?.partyType);
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
                partyType: this.partyType,
                accessibilityAcknowledged: hasAccessibleSeat || Boolean(matchingDraft?.accessibilityAcknowledged)
            };
            const restored = this.selectShowtime(hold.showtimeId, {
                announce: false,
                restoredDraft,
                allowHoldId: hold.id,
                persist: false
            });
            if (restored) {
                this.quote = hold.pricingQuote;
                this.persistDraft();
                this.renderSummary();
                this.checkout.openHold({
                    hold,
                    ownerId: hold.ownerId,
                    restored: true
                });
                return;
            }
        }

        const draft = savedDraft.ok ? savedDraft.value : null;
        const draftShowtime = draft && this.allShowtimes.some(item =>
            item.showtime.id === draft.showtimeId &&
            item.availability.bookable
        ) ? draft.showtimeId : fallbackShowtimeId;
        if (draft && draftShowtime === draft.showtimeId) {
            this.setTicketItems(draft.ticketItems, draft.partyType);
            this.preferences = new Set(draft.preferences);
        }
        this.selectShowtime(draftShowtime, {
            announce: false,
            restoredDraft: draftShowtime === draft?.showtimeId ? draft : null
        });
    }

    setTicketItems(ticketItems, preferredPartyType = null) {
        this.ticketQuantities = new Map(
            ticketItems.map(item => [item.ticketTypeId, item.quantity])
        );
        this.syncPartyType(preferredPartyType);
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
            partyType: this.partyType,
            accessibilityAcknowledged: Boolean(restoredDraft?.accessibilityAcknowledged)
        });
        if (!draft.ok) {
            this.notify(draft.error.message);
            return false;
        }
        this.context = context.value;
        this.recommendedSeatIds.clear();
        this.showtimes = this.catalogController.list(this.catalogSelection());
        this.inventory = inventory.value;
        this.refreshSeatGuidance();
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
        this.seatMap.resetFocus();
        this.hideSeatConflict();
        this.updateQuote();
        this.renderAll();
        if (persist) this.persistDraft();
        if (restoredDraft && restoredSeatIds.length < restoredDraft.selectedSeatIds.length) {
            this.notify('部分座位已不可用，已保留仍可选择的座位');
        }
        if (announce) {
            this.announce(
                `已切换到 ${this.context.movie.title}，${this.context.cinema.name}，` +
                `${formatDate(this.context.showtime.startsAt)} ${formatTime(this.context.showtime.startsAt)} 场次`
            );
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
        if (next < 0 || nextTotal < 1 || nextTotal > this.ticketLimit) return;
        const hadSeats = this.draft.selectedSeatIds.length > 0;
        this.recommendedSeatIds.clear();
        this.ticketQuantities.set(ticketTypeId, next);
        this.syncPartyType(this.partyType);
        this.hideSeatConflict();
        this.rebuildDraft({ preserveSeats: false });
        if (hadSeats) this.notify('票数已变化，请重新选择对应数量的座位');
    }

    syncPartyType(preferredPartyType = this.partyType) {
        const result = this.booking.getPartyTypeOptions(this.ticketItems());
        if (!result.ok) return;
        const preferred = result.value.find(option => option.id === preferredPartyType && option.allowed);
        this.partyType = preferred?.id || result.value.find(option => option.recommended)?.id || 'family';
    }

    changePartyType(partyType) {
        if (partyType === this.partyType) return;
        this.partyType = partyType;
        this.recommendedSeatIds.clear();
        const hadSeats = this.draft.selectedSeatIds.length > 0;
        this.rebuildDraft({ preserveSeats: true });
        if (hadSeats) this.notify('同行方式已更新；现有座位保留，可重新请求更合适的连座');
    }

    togglePreference(preference, button) {
        if (this.preferences.has(preference)) this.preferences.delete(preference);
        else this.preferences.add(preference);
        button.setAttribute('aria-pressed', String(this.preferences.has(preference)));
        this.recommendedSeatIds.clear();
        this.rebuildDraft({ preserveSeats: true });
    }

    togglePopularity() {
        this.showPopularity = !this.showPopularity;
        this.decisionSupport.renderPopularity(this.showPopularity, this.heatPeriod);
        this.renderSeatMap();
        this.announce(`座位热度参考已${this.showPopularity ? '显示' : '隐藏'}`);
    }

    changeHeatPeriod(period) {
        if (period === this.heatPeriod) return;
        this.heatPeriod = period;
        this.decisionSupport.renderPopularity(this.showPopularity, this.heatPeriod);
        this.renderSeatMap();
        const labels = {
            monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四',
            friday: '周五', saturday: '周六', sunday: '周日', week: '一周综合'
        };
        this.announce(`已显示${labels[period] || '一周综合'}座位热度`);
    }

    refreshSeatGuidance() {
        const result = this.booking.getSeatPopularity(this.context.showtime.id);
        this.popularityBySeat = result.ok ? result.value : {};
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
            partyType: this.partyType,
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
        this.renderDecisionSupport();
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
        this.seatMap.rememberFocus(seatId);

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
        this.hideSeatConflict();
        this.updateQuote();
        this.renderSeatMap();
        this.renderSummary();
        this.persistDraft();
        this.announce(`${seat.label}${selected.has(seatId) ? '已选择' : '已取消'}`);
    }

    selectSeatBlock(seatIds) {
        const availableCandidates = seatIds
            .map(id => this.context.auditorium.seats.find(seat => seat.id === id))
            .filter(seat => seat && !this.isSeatUnavailable(seat.id));
        if (availableCandidates.length === 0) return;
        const selected = new Set(this.draft.selectedSeatIds);
        const selectedSeats = [...selected].map(id =>
            this.context.auditorium.seats.find(seat => seat.id === id)
        ).filter(Boolean);
        const sectionId = selectedSeats[0]?.sectionId || availableCandidates[0].sectionId;
        const capacity = this.draft.ticketCount - selected.size;
        const additions = availableCandidates
            .filter(seat => seat.sectionId === sectionId && !selected.has(seat.id))
            .slice(0, Math.max(0, capacity));
        additions.forEach(seat => selected.add(seat.id));
        if (additions.length === 0) {
            this.notify(`本单有 ${this.draft.ticketCount} 张票；请先取消座位再框选`);
            return;
        }
        const replaced = this.booking.replaceSeats(this.draft, [...selected]);
        if (!replaced.ok) return this.notify(replaced.error.message);
        this.draft = replaced.value;
        this.seatMap.rememberFocus(additions[0].id);
        this.hideSeatConflict();
        this.updateQuote();
        this.renderSeatMap();
        this.renderSummary();
        this.persistDraft();
        this.announce(`已框选 ${additions.map(seat => seat.label).join('、')}`);
    }

    recommendSeats() {
        const result = this.booking.recommendSeats(this.draft);
        if (!result.ok) return this.notify(result.error.message);
        this.draft = result.value.draft;
        this.recommendedSeatIds = new Set(result.value.seats.map(seat => seat.id));
        this.hideSeatConflict();
        this.seatMap.rememberFocus(this.draft.selectedSeatIds[0]);
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
        this.catalogController.render(this.catalogSelection());
        this.renderContext();
        this.renderShowtimes();
        this.renderTickets();
        this.renderDecisionSupport();
        this.renderSeatMap();
        this.renderSummary();
    }

    renderContext() {
        const { movie, cinema, auditorium, showtime, refundPolicy } = this.context;
        element('movie-title').textContent = movie.title;
        element('movie-original').textContent = movie.originalTitle;
        element('movie-synopsis').textContent = movie.synopsis;
        const poster = element('movie-poster');
        poster.dataset.artwork = movie.artwork || 'cosmic-orbit';
        poster.setAttribute('aria-label', `${movie.title}影片封面`);
        const posterRequestId = ++this.posterRequestId;
        poster.classList.remove('has-poster-error');
        poster.classList.toggle('is-poster-loading', Boolean(movie.posterUrl));
        const previousPosterImage = element('poster-image');
        const posterImage = document.createElement('img');
        posterImage.id = 'poster-image';
        posterImage.className = 'poster-image';
        posterImage.alt = '';
        posterImage.decoding = 'async';
        posterImage.fetchPriority = 'high';
        posterImage.referrerPolicy = 'no-referrer';
        posterImage.setAttribute('aria-hidden', 'true');
        if (movie.posterUrl) {
            posterImage.addEventListener('load', () => {
                if (posterRequestId !== this.posterRequestId) return;
                previousPosterImage.replaceWith(posterImage);
                poster.classList.remove('is-poster-loading', 'has-poster-error');
                poster.classList.add('has-poster-image');
            }, { once: true });
            posterImage.addEventListener('error', () => {
                if (posterRequestId !== this.posterRequestId) return;
                previousPosterImage.replaceWith(posterImage);
                poster.classList.remove('is-poster-loading', 'has-poster-image');
                poster.classList.add('has-poster-error');
            }, { once: true });
            posterImage.src = movie.posterUrl;
        } else {
            previousPosterImage.replaceWith(posterImage);
            poster.classList.remove('is-poster-loading', 'has-poster-image');
            poster.classList.add('has-poster-error');
        }
        element('poster-title').textContent = movie.originalTitle || movie.title;
        const meta = element('movie-meta');
        meta.replaceChildren();
        [...movie.genres, `${movie.durationMinutes} 分钟`, movie.audienceRating].forEach(value =>
            appendText(meta, 'span', value)
        );
        element('cinema-name').textContent = cinema.name;
        element('cinema-address').textContent = cinema.address;
        element('showtime-date').textContent = formatDate(showtime.startsAt);
        element('auditorium-name').textContent = `${auditorium.name} · ${auditorium.seats.length} 座`;
        element('showtime-format').textContent = `${showtime.format} · ${showtime.language}`;
        element('refund-note').textContent = refundPolicy.summary;
        element('summary-time').textContent = formatTime(showtime.startsAt);
        element('summary-date').textContent = formatDate(showtime.startsAt);
        element('summary-auditorium').textContent = `${auditorium.name} · ${auditorium.seats.length} 座 · ${showtime.format}`;
    }

    renderShowtimes() {
        const list = element('showtime-list');
        list.replaceChildren();
        this.showtimes.forEach(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'showtime-option';
            button.dataset.showtimeId = item.showtime.id;
            button.setAttribute('role', 'listitem');
            button.setAttribute('aria-pressed', String(item.showtime.id === this.context.showtime.id));
            button.disabled = !item.availability.bookable;
            appendText(button, 'strong', formatTime(item.showtime.startsAt));
            appendText(button, 'small', `${item.showtime.format} · ${item.showtime.language}`);
            appendText(
                button,
                'span',
                button.disabled ? item.availability.label : `${formatAmount(item.priceFrom)}起`,
                'showtime-price'
            );
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
            increase.disabled = this.ticketCount >= this.ticketLimit;
            increase.setAttribute('aria-label', `增加${ticketType.label}`);
            stepper.append(decrease, output, increase);
            item.append(copy, stepper);
            list.append(item);
        });
    }

    renderDecisionSupport() {
        this.decisionSupport.renderPartyTypes({
            ticketItems: this.ticketItems(),
            ticketQuantities: this.ticketQuantities,
            partyType: this.partyType
        });
        this.decisionSupport.renderPopularity(this.showPopularity, this.heatPeriod);
    }

    renderSeatMap({ focusSeat = false } = {}) {
        this.seatMap.render({ focusSeat });
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
        this.decisionSupport.renderGuide(this.draft);
    }

    placeHold(trigger) {
        if (!this.quote || this.checkout.isHolding()) return;
        const ownerId = this.app.getBookingOwnerId();
        const result = this.booking.placeHold({
            draft: this.draft,
            ownerId,
            idempotencyKey: this.booking.createHoldRequestKey(),
            holdDurationSeconds: 600
        });
        if (!result.ok) {
            if (result.error.code === 'SEAT_UNAVAILABLE') {
                this.recoverFromSeatConflict(result.error.details.seatIds || []);
                return;
            }
            this.refreshInventory();
            if (result.error.code === 'ACCESSIBLE_SEAT_ACKNOWLEDGEMENT_REQUIRED') {
                element('accessible-confirm').hidden = false;
                element('accessible-acknowledgement').focus();
            }
            return this.notify(result.error.message);
        }
        this.checkout.openHold({
            hold: result.value.hold,
            ownerId,
            trigger
        });
    }

    recoverFromSeatConflict(conflictingSeatIds) {
        const inventory = this.booking.getInventory(this.context.showtime.id);
        if (!inventory.ok) return this.notify(inventory.error.message);
        this.inventory = inventory.value;
        this.refreshSeatGuidance();
        const unavailable = new Set([
            ...this.inventory.soldSeatIds,
            ...Object.keys(this.inventory.holdIdsBySeatId)
        ]);
        const removed = this.draft.selectedSeatIds.filter(seatId =>
            unavailable.has(seatId) || conflictingSeatIds.includes(seatId)
        );
        const remaining = this.draft.selectedSeatIds.filter(seatId => !unavailable.has(seatId));
        const replaced = this.booking.replaceSeats(this.draft, remaining);
        if (replaced.ok) this.draft = replaced.value;
        this.updateQuote();
        this.persistDraft();
        this.renderSeatMap();
        this.renderSummary();
        const labels = removed.map(id =>
            this.context.auditorium.seats.find(seat => seat.id === id)?.label || id
        );
        element('seat-conflict-message').textContent = labels.length > 0 ?
            `${labels.join('、')} 已不可用并从本单移除。` :
            '原座位组合已不可用并从本单移除。';
        element('seat-conflict').hidden = false;
        element('seat-conflict-recommend').focus();
        this.notify('座位库存刚刚发生变化，请重新选择');
        this.announce('部分座位已被其他观众抢先选择，已从本单移除');
    }

    hideSeatConflict() {
        element('seat-conflict').hidden = true;
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
        this.preferencesController.refresh();
        this.checkout.refreshForAuth();
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
