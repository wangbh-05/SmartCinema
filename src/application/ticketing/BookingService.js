import {
    createBookingDraft,
    getPartyTypeOptions,
    MAX_TICKETS_PER_ORDER,
    replaceDraftSeats
} from '../../domain/booking/BookingDraft.js';
import { quoteBooking } from '../../domain/booking/PricingQuote.js';
import { recommendSeatBlocks } from './RecommendSeatBlock.js';
import {
    consumeBookingHold,
    expireBookingHold,
    placeBookingHold,
    releaseBookingHold
} from '../../domain/booking/HoldBooking.js';
import { isSeatHoldActive } from '../../domain/booking/SeatHold.js';
import { createShowtimeInventory } from '../../domain/booking/ShowtimeInventory.js';
import {
    createSeatPopularityMap,
    evaluateSeatDecision
} from '../../domain/booking/SeatDecisionGuide.js';
import { createTicketOrder } from '../../domain/order/TicketOrder.js';
import { getTicketOrderCancellationEligibility } from '../../domain/order/TicketOrder.js';
import { cancelBooking } from '../../domain/order/CancelBooking.js';
import { err, ok } from '../../shared/Result.js';

export class BookingService {
    constructor({ catalogRepository, stateRepository, clock, idGenerator }) {
        this.catalogRepository = catalogRepository;
        this.stateRepository = stateRepository;
        this.clock = clock;
        this.idGenerator = idGenerator;
    }

    getCatalogNavigation() {
        return ok(Object.freeze({
            movies: Object.freeze(this.catalogRepository.listMovies()),
            cinemas: Object.freeze(this.catalogRepository.listCinemas()),
            businessDates: Object.freeze(this.catalogRepository.listBusinessDates())
        }));
    }

    getTicketLimit() {
        return MAX_TICKETS_PER_ORDER;
    }

    listShowtimes(filters = {}) {
        const showtimes = this.catalogRepository.listShowtimes(filters);
        return ok(showtimes.map(showtime => this._contextForShowtime(showtime)));
    }

    getBookingContext(showtimeId) {
        const showtime = this.catalogRepository.getShowtime(showtimeId);
        if (!showtime) return err('SHOWTIME_NOT_FOUND', '场次不存在或已下架', { showtimeId });
        return ok({
            ...this._contextForShowtime(showtime),
            ticketTypes: this.catalogRepository.listTicketTypes()
        });
    }

    createDraft({
        showtimeId,
        ticketItems,
        preferences = [],
        partyType = null,
        accessibilityAcknowledged = false
    }) {
        const availability = this._validateShowtimeForSale(showtimeId, this.clock.now());
        if (!availability.ok) return availability;
        try {
            return ok(createBookingDraft({
                showtimeId,
                ticketItems,
                selectedSeatIds: [],
                preferences,
                partyType,
                accessibilityAcknowledged,
                updatedAt: this.clock.now()
            }));
        } catch (error) {
            return err('VALIDATION_ERROR', error.message, error.details || {});
        }
    }

    getPartyTypeOptions(ticketItems) {
        try {
            return ok(getPartyTypeOptions(ticketItems));
        } catch (error) {
            return err('VALIDATION_ERROR', error.message, error.details || {});
        }
    }

    replaceSeats(draft, seatIds) {
        return replaceDraftSeats(draft, seatIds, this.clock.now());
    }

    recommendSeats(draft, {
        selectionPolicy = {},
        preserveSeatIds = [],
        limit = 5,
        includeAlternate = true,
        advisorIntent = null
    } = {}) {
        const context = this.getBookingContext(draft.showtimeId);
        if (!context.ok) return context;
        const inventory = this.getInventory(draft.showtimeId);
        if (!inventory.ok) return inventory;
        const candidates = this._recommendationCandidates({
            draft,
            context: context.value,
            inventory: inventory.value,
            selectionPolicy,
            preserveSeatIds,
            limit,
            advisorIntent
        });
        if (!candidates.ok) return candidates;
        if (candidates.value.length > 0) {
            const primary = candidates.value[0];
            return ok(Object.freeze({
                status: 'recommended',
                candidates: candidates.value,
                alternateShowtime: null,
                inventoryRevision: inventory.value.revision,
                // Compatibility aliases for application consumers that only need the first result.
                draft: primary.draft,
                seats: primary.seats,
                reason: primary.reason
            }));
        }
        if (!includeAlternate) {
            return ok(Object.freeze({
                status: 'unavailable',
                candidates: Object.freeze([]),
                alternateShowtime: null,
                inventoryRevision: inventory.value.revision
            }));
        }
        const alternate = this._findAlternateShowtimeRecommendation(draft, {
            selectionPolicy,
            limit,
            advisorIntent
        });
        if (!alternate.ok) return alternate;
        return ok(Object.freeze({
            status: alternate.value ? 'alternate-showtime' : 'unavailable',
            candidates: Object.freeze([]),
            alternateShowtime: alternate.value,
            inventoryRevision: inventory.value.revision
        }));
    }

    getSeatDecisionGuide(draft) {
        const context = this.getBookingContext(draft.showtimeId);
        if (!context.ok) return context;
        const inventory = this.getInventory(draft.showtimeId);
        if (!inventory.ok) return inventory;
        try {
            return ok(evaluateSeatDecision({
                auditorium: context.value.auditorium,
                seatIds: draft.selectedSeatIds,
                inventory: inventory.value,
                pricingPolicy: context.value.pricingPolicy
            }));
        } catch (error) {
            return err('VALIDATION_ERROR', error.message, error.details || {});
        }
    }

    getSeatPopularity(showtimeId) {
        const context = this.getBookingContext(showtimeId);
        if (!context.ok) return context;
        const inventory = this.getInventory(showtimeId);
        if (!inventory.ok) return inventory;
        return ok(createSeatPopularityMap({
            auditorium: context.value.auditorium,
            inventory: inventory.value
        }));
    }

    quoteDraft(draft) {
        const context = this.getBookingContext(draft.showtimeId);
        if (!context.ok) return context;
        return quoteBooking({
            draft,
            auditorium: context.value.auditorium,
            ticketTypesById: this.catalogRepository.getTicketTypesById(),
            pricingPolicy: context.value.pricingPolicy,
            quotedAt: this.clock.now()
        });
    }

    createHoldRequestKey() {
        return this.idGenerator.next('hold-request');
    }

    listOrders(userId) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const orders = Object.values(current.value.ordersById)
            .filter(order => order.userId === userId)
            .sort((left, right) => Date.parse(right.confirmedAt) - Date.parse(left.confirmedAt));
        return ok(Object.freeze(orders));
    }

    getOrderCancellationEligibility({ orderId, actorUserId }) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const order = current.value.ordersById[orderId];
        if (!order) return err('ORDER_NOT_FOUND', '订单不存在', { orderId });
        if (order.userId !== actorUserId) return err('FORBIDDEN', '不能查看其他用户的退票资格');
        return ok(getTicketOrderCancellationEligibility(order, this.clock.now()));
    }

    cancelOrder({ orderId, actorUserId, reason = 'customer-requested' }) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const order = current.value.ordersById[orderId];
        if (!order) return err('ORDER_NOT_FOUND', '订单不存在', { orderId });
        if (order.userId !== actorUserId) return err('FORBIDDEN', '不能取消其他用户的订单');
        if (order.status === 'cancelled') {
            return ok({ order, state: current.value, idempotent: true });
        }
        const inventory = current.value.inventoriesByShowtime[order.showtimeSnapshot.id];
        const cancelled = cancelBooking({ order, inventory }, {
            cancelledAt: this.clock.now(),
            reason
        });
        if (!cancelled.ok) return cancelled;
        const persisted = this.stateRepository.update(current.value.revision, state => {
            state.ordersById[order.id] = cancelled.value.order;
            state.inventoriesByShowtime[order.showtimeSnapshot.id] = cancelled.value.inventory;
        });
        if (!persisted.ok) return persisted;
        return ok({
            order: persisted.value.ordersById[order.id],
            state: persisted.value,
            idempotent: false
        });
    }

    getInventory(showtimeId) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        return ok(current.value.inventoriesByShowtime[showtimeId] || createShowtimeInventory({
            showtimeId,
            revision: 0,
            soldSeatIds: [],
            holdIdsBySeatId: {},
            updatedAt: current.value.updatedAt
        }));
    }

    findActiveHold(ownerIds) {
        const normalizedOwnerIds = [...new Set(
            (Array.isArray(ownerIds) ? ownerIds : [ownerIds])
                .filter(ownerId => typeof ownerId === 'string' && ownerId.trim().length > 0)
                .map(ownerId => ownerId.trim())
        )];
        if (normalizedOwnerIds.length === 0) {
            return err('VALIDATION_ERROR', '查询有效锁座至少需要一个 ownerId');
        }
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const owners = new Set(normalizedOwnerIds);
        const hold = Object.values(current.value.holdsById)
            .filter(candidate => owners.has(candidate.ownerId) && isSeatHoldActive(candidate, this.clock.now()))
            .sort((left, right) => Date.parse(right.heldAt) - Date.parse(left.heldAt))[0] || null;
        return ok(hold);
    }

    sweepExpiredHolds() {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const now = this.clock.now();
        const expiredCandidates = Object.values(current.value.holdsById)
            .filter(hold => hold.status === 'held' && Date.parse(hold.expiresAt) <= Date.parse(now))
            .sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt));
        if (expiredCandidates.length === 0) {
            return ok({ state: current.value, expiredCount: 0, holds: Object.freeze([]) });
        }

        const inventoriesByShowtime = { ...current.value.inventoriesByShowtime };
        const expiredHolds = [];
        for (const hold of expiredCandidates) {
            const inventory = inventoriesByShowtime[hold.showtimeId];
            if (!inventory) {
                return err('STORAGE_CORRUPTED', '过期锁座缺少对应场次库存', {
                    holdId: hold.id,
                    showtimeId: hold.showtimeId
                });
            }
            const expired = expireBookingHold({ hold, inventory }, now);
            if (!expired.ok) return expired;
            expiredHolds.push(expired.value.hold);
            inventoriesByShowtime[hold.showtimeId] = expired.value.inventory;
        }

        const persisted = this.stateRepository.update(current.value.revision, state => {
            expiredHolds.forEach(hold => {
                state.holdsById[hold.id] = hold;
            });
            Object.values(inventoriesByShowtime).forEach(inventory => {
                state.inventoriesByShowtime[inventory.showtimeId] = inventory;
            });
        });
        if (!persisted.ok) return persisted;
        return ok({
            state: persisted.value,
            expiredCount: expiredHolds.length,
            holds: Object.freeze(expiredHolds)
        });
    }

    placeHold({
        draft,
        ownerId,
        idempotencyKey,
        holdDurationSeconds = 600,
        selectionPolicy = {}
    }) {
        const now = this.clock.now();
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        if (!current.value.usersById[ownerId] && !ownerId.startsWith('guest:')) {
            return err('AUTH_REQUIRED', '需要有效用户或访客会话才能锁座');
        }

        const existing = Object.values(current.value.holdsById)
            .find(hold => hold.idempotencyKey === idempotencyKey);
        if (existing) {
            if (existing.ownerId !== ownerId) {
                return err('FORBIDDEN', '锁座请求不属于当前用户');
            }
            if (existing.status === 'held' && isSeatHoldActive(existing, now)) {
                return ok({ hold: existing, state: current.value, idempotent: true });
            }
            return err('HOLD_STATE_INVALID', '该锁座请求已结束', { status: existing.status });
        }

        const availability = this._validateShowtimeForSale(draft.showtimeId, now);
        if (!availability.ok) return availability;

        const showtime = availability.value;
        const auditorium = this.catalogRepository.getAuditorium(showtime.auditoriumId);
        const pricingPolicy = this.catalogRepository.getPricingPolicy(showtime.pricingPolicyId);
        if (!auditorium || !pricingPolicy) {
            return err('CATALOG_INCOMPLETE', '场次的影厅或价格政策不可用');
        }
        const inventory = current.value.inventoriesByShowtime[showtime.id] || createShowtimeInventory({
            showtimeId: showtime.id,
            revision: 0,
            soldSeatIds: [],
            holdIdsBySeatId: {},
            updatedAt: current.value.updatedAt
        });
        const placed = placeBookingHold({
            draft,
            ownerId,
            holdId: this.idGenerator.next('hold'),
            idempotencyKey,
            now,
            holdDurationSeconds,
            auditorium,
            inventory,
            ticketTypesById: this.catalogRepository.getTicketTypesById(),
            pricingPolicy,
            selectionPolicy
        });
        if (!placed.ok) return placed;

        const persisted = this.stateRepository.update(current.value.revision, state => {
            state.inventoriesByShowtime[showtime.id] = placed.value.inventory;
            state.holdsById[placed.value.hold.id] = placed.value.hold;
        });
        if (!persisted.ok) return persisted;
        return ok({ hold: persisted.value.holdsById[placed.value.hold.id], state: persisted.value, idempotent: false });
    }

    releaseHold({ holdId, actorOwnerId, reason = 'user-cancelled' }) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const hold = current.value.holdsById[holdId];
        if (!hold) return err('HOLD_NOT_FOUND', '锁座记录不存在', { holdId });
        if (hold.ownerId !== actorOwnerId) return err('FORBIDDEN', '锁座记录不属于当前用户');
        const inventory = current.value.inventoriesByShowtime[hold.showtimeId];
        const released = releaseBookingHold({ hold, inventory }, {
            releasedAt: this.clock.now(),
            reason
        });
        if (!released.ok) return released;
        return this._persistHoldAndInventory(current.value, released.value);
    }

    expireHold(holdId) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const hold = current.value.holdsById[holdId];
        if (!hold) return err('HOLD_NOT_FOUND', '锁座记录不存在', { holdId });
        const inventory = current.value.inventoriesByShowtime[hold.showtimeId];
        const expired = expireBookingHold({ hold, inventory }, this.clock.now());
        if (!expired.ok) return expired;
        return this._persistHoldAndInventory(current.value, expired.value);
    }

    confirmHold({ holdId, actorOwnerId, userId }) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const hold = current.value.holdsById[holdId];
        if (!hold) return err('HOLD_NOT_FOUND', '锁座记录不存在', { holdId });
        if (hold.ownerId !== actorOwnerId) return err('FORBIDDEN', '锁座记录不属于当前会话');
        if (!current.value.usersById[userId]) return err('AUTH_REQUIRED', '确认订单前需要登录');
        if (hold.status === 'consumed') {
            const order = current.value.ordersById[hold.consumedOrderId];
            return order ? ok({ order, state: current.value, idempotent: true }) :
                err('STORAGE_CORRUPTED', '已消费 hold 缺少订单');
        }

        const showtime = this.catalogRepository.getShowtime(hold.showtimeId);
        if (!showtime) return err('SHOWTIME_NOT_FOUND', '场次不存在或已下架');
        const movie = this.catalogRepository.getMovie(showtime.movieId);
        const cinema = this.catalogRepository.getCinema(showtime.cinemaId);
        const auditorium = this.catalogRepository.getAuditorium(showtime.auditoriumId);
        const refundPolicy = this.catalogRepository.getRefundPolicy(showtime.refundPolicyId);
        if (!movie || !cinema || !auditorium || !refundPolicy) {
            return err('CATALOG_INCOMPLETE', '订单快照所需目录数据不可用');
        }

        const orderId = this.idGenerator.next('order');
        const consumed = consumeBookingHold({
            hold,
            inventory: current.value.inventoriesByShowtime[hold.showtimeId]
        }, {
            orderId,
            consumedAt: this.clock.now()
        });
        if (!consumed.ok) return consumed;
        let order;
        try {
            order = createTicketOrder({
                id: orderId,
                idempotencyKey: hold.idempotencyKey,
                userId,
                hold: consumed.value.hold,
                movie,
                cinema,
                auditorium,
                showtime,
                refundPolicy,
                ticketCode: this._createTicketCode(),
                qrPayload: `smartcinema:ticket:${orderId}`,
                confirmedAt: this.clock.now()
            });
        } catch (error) {
            return err('VALIDATION_ERROR', error.message, error.details || {});
        }

        const persisted = this.stateRepository.update(current.value.revision, state => {
            state.holdsById[hold.id] = consumed.value.hold;
            state.inventoriesByShowtime[hold.showtimeId] = consumed.value.inventory;
            state.ordersById[order.id] = order;
        });
        if (!persisted.ok) return persisted;
        return ok({ order: persisted.value.ordersById[order.id], state: persisted.value, idempotent: false });
    }

    _recommendationCandidates({
        draft,
        context,
        inventory,
        selectionPolicy,
        preserveSeatIds,
        limit,
        advisorIntent = null
    }) {
        const candidates = recommendSeatBlocks({
            draft,
            auditorium: context.auditorium,
            inventory,
            pricingPolicy: context.pricingPolicy,
            updatedAt: this.clock.now(),
            policy: selectionPolicy,
            preserveSeatIds,
            limit,
            advisorIntent
        });
        const enriched = [];
        for (const candidate of candidates) {
            const pricingQuote = quoteBooking({
                draft: candidate.draft,
                auditorium: context.auditorium,
                ticketTypesById: this.catalogRepository.getTicketTypesById(),
                pricingPolicy: context.pricingPolicy,
                quotedAt: this.clock.now()
            });
            if (!pricingQuote.ok) return pricingQuote;
            enriched.push(Object.freeze({
                ...candidate,
                pricingQuote: pricingQuote.value
            }));
        }
        return ok(Object.freeze(enriched));
    }

    _findAlternateShowtimeRecommendation(draft, { selectionPolicy, limit, advisorIntent = null }) {
        const current = this.catalogRepository.getShowtime(draft.showtimeId);
        if (!current) return err('SHOWTIME_NOT_FOUND', '场次不存在或已下架', {
            showtimeId: draft.showtimeId
        });
        const businessDate = current.startsAt.slice(0, 10);
        const showtimes = this.catalogRepository.listShowtimes({
            movieId: current.movieId,
            cinemaId: current.cinemaId,
            businessDate
        }).filter(showtime =>
            showtime.id !== current.id &&
            this._availabilityForShowtime(showtime, this.clock.now()).bookable
        ).sort((left, right) => {
            const leftDistance = Math.abs(Date.parse(left.startsAt) - Date.parse(current.startsAt));
            const rightDistance = Math.abs(Date.parse(right.startsAt) - Date.parse(current.startsAt));
            if (leftDistance !== rightDistance) return leftDistance - rightDistance;
            return Date.parse(left.startsAt) - Date.parse(right.startsAt);
        });

        for (const showtime of showtimes) {
            let alternateDraft;
            try {
                alternateDraft = createBookingDraft({
                    ...draft,
                    showtimeId: showtime.id,
                    selectedSeatIds: [],
                    updatedAt: this.clock.now()
                });
            } catch (error) {
                return err('VALIDATION_ERROR', error.message, error.details || {});
            }
            const inventory = this.getInventory(showtime.id);
            if (!inventory.ok) return inventory;
            const context = this._contextForShowtime(showtime);
            const candidates = this._recommendationCandidates({
                draft: alternateDraft,
                context,
                inventory: inventory.value,
                selectionPolicy,
                preserveSeatIds: [],
                limit,
                advisorIntent
            });
            if (!candidates.ok) return candidates;
            if (candidates.value.length > 0) {
                return ok(Object.freeze({
                    context,
                    candidates: candidates.value,
                    inventoryRevision: inventory.value.revision
                }));
            }
        }
        return ok(null);
    }

    _contextForShowtime(showtime) {
        const pricingPolicy = this.catalogRepository.getPricingPolicy(showtime.pricingPolicyId);
        return Object.freeze({
            showtime,
            movie: this.catalogRepository.getMovie(showtime.movieId),
            cinema: this.catalogRepository.getCinema(showtime.cinemaId),
            auditorium: this.catalogRepository.getAuditorium(showtime.auditoriumId),
            pricingPolicy,
            refundPolicy: this.catalogRepository.getRefundPolicy(showtime.refundPolicyId),
            priceFrom: pricingPolicy?.baseTicketPrice ?? null,
            availability: this._availabilityForShowtime(showtime, this.clock.now())
        });
    }

    _createTicketCode() {
        const raw = this.idGenerator.next('ticket').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return `SC-${raw.slice(-10).padStart(10, '0')}`;
    }

    _validateShowtimeForSale(showtimeId, now) {
        const showtime = this.catalogRepository.getShowtime(showtimeId);
        if (!showtime) return err('SHOWTIME_NOT_FOUND', '场次不存在或已下架', { showtimeId });
        const availability = this._availabilityForShowtime(showtime, now);
        if (!availability.bookable) return err(availability.code, availability.label, {
            salesState: showtime.salesState
        });
        return ok(showtime);
    }

    _availabilityForShowtime(showtime, now) {
        if (!['on-sale', 'few-seats'].includes(showtime.salesState)) {
            return Object.freeze({
                bookable: false,
                code: 'SHOWTIME_NOT_ON_SALE',
                label: showtime.salesState === 'sold-out' ? '已售罄' : '当前场次不可购票'
            });
        }
        const timestamp = Date.parse(now);
        if (showtime.bookingOpensAt && timestamp < Date.parse(showtime.bookingOpensAt)) {
            return Object.freeze({ bookable: false, code: 'BOOKING_NOT_OPEN', label: '尚未开售' });
        }
        if (timestamp >= Date.parse(showtime.bookingClosesAt)) {
            return Object.freeze({ bookable: false, code: 'BOOKING_CLOSED', label: '已停售' });
        }
        return Object.freeze({
            bookable: true,
            code: null,
            label: showtime.salesState === 'few-seats' ? '余票紧张' : '可购票'
        });
    }

    _persistHoldAndInventory(currentState, result) {
        const persisted = this.stateRepository.update(currentState.revision, state => {
            state.holdsById[result.hold.id] = result.hold;
            state.inventoriesByShowtime[result.inventory.showtimeId] = result.inventory;
        });
        if (!persisted.ok) return persisted;
        return ok({
            hold: persisted.value.holdsById[result.hold.id],
            state: persisted.value
        });
    }
}

export default BookingService;
