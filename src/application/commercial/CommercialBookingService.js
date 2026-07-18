import { createBookingDraft, replaceDraftSeats } from '../../domain/booking/BookingDraft.js';
import { quoteBooking } from '../../domain/booking/PricingQuote.js';
import { recommendSeatBlock } from './RecommendSeatBlock.js';
import {
    consumeBookingHold,
    expireBookingHold,
    placeBookingHold,
    releaseBookingHold
} from '../../domain/booking/HoldBooking.js';
import { isSeatHoldActive } from '../../domain/booking/SeatHold.js';
import { createShowtimeInventory } from '../../domain/booking/ShowtimeInventory.js';
import { createCommercialOrder } from '../../domain/order/CommercialOrder.js';
import { getCommercialCancellationEligibility } from '../../domain/order/CommercialOrder.js';
import { cancelCommercialBooking } from '../../domain/order/CancelCommercialBooking.js';
import { err, ok } from '../../shared/Result.js';

export class CommercialBookingService {
    constructor({ catalogRepository, stateRepository, clock, idGenerator }) {
        this.catalogRepository = catalogRepository;
        this.stateRepository = stateRepository;
        this.clock = clock;
        this.idGenerator = idGenerator;
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
                accessibilityAcknowledged,
                updatedAt: this.clock.now()
            }));
        } catch (error) {
            return err('VALIDATION_ERROR', error.message, error.details || {});
        }
    }

    replaceSeats(draft, seatIds) {
        return replaceDraftSeats(draft, seatIds, this.clock.now());
    }

    recommendSeats(draft, selectionPolicy = {}) {
        const context = this.getBookingContext(draft.showtimeId);
        if (!context.ok) return context;
        const inventory = this.getInventory(draft.showtimeId);
        if (!inventory.ok) return inventory;
        return recommendSeatBlock({
            draft,
            auditorium: context.value.auditorium,
            inventory: inventory.value,
            updatedAt: this.clock.now(),
            policy: selectionPolicy
        });
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
        return ok(getCommercialCancellationEligibility(order, this.clock.now()));
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
        const cancelled = cancelCommercialBooking({ order, inventory }, {
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
            order = createCommercialOrder({
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

    _contextForShowtime(showtime) {
        const pricingPolicy = this.catalogRepository.getPricingPolicy(showtime.pricingPolicyId);
        return Object.freeze({
            showtime,
            movie: this.catalogRepository.getMovie(showtime.movieId),
            cinema: this.catalogRepository.getCinema(showtime.cinemaId),
            auditorium: this.catalogRepository.getAuditorium(showtime.auditoriumId),
            pricingPolicy,
            refundPolicy: this.catalogRepository.getRefundPolicy(showtime.refundPolicyId),
            priceFrom: pricingPolicy?.baseTicketPrice ?? null
        });
    }

    _createTicketCode() {
        const raw = this.idGenerator.next('ticket').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return `SC-${raw.slice(-10).padStart(10, '0')}`;
    }

    _validateShowtimeForSale(showtimeId, now) {
        const showtime = this.catalogRepository.getShowtime(showtimeId);
        if (!showtime) return err('SHOWTIME_NOT_FOUND', '场次不存在或已下架', { showtimeId });
        if (!['on-sale', 'few-seats'].includes(showtime.salesState)) {
            return err('SHOWTIME_NOT_ON_SALE', '当前场次不可购票', { salesState: showtime.salesState });
        }
        const timestamp = Date.parse(now);
        if (showtime.bookingOpensAt && timestamp < Date.parse(showtime.bookingOpensAt)) {
            return err('BOOKING_NOT_OPEN', '当前场次尚未开售');
        }
        if (timestamp >= Date.parse(showtime.bookingClosesAt)) {
            return err('BOOKING_CLOSED', '当前场次已停止售票');
        }
        return ok(showtime);
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

export default CommercialBookingService;
