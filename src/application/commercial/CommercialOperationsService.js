import { releaseBookingHold } from '../../domain/booking/HoldBooking.js';
import { isSeatHoldActive } from '../../domain/booking/SeatHold.js';
import { sanitizeUser } from '../../domain/user/User.js';
import { err, ok } from '../../shared/Result.js';

function money(amount, currency = 'CNY') {
    return Object.freeze({ amount, currency });
}

export class CommercialOperationsService {
    constructor({
        stateRepository,
        booking,
        backup,
        clock
    }) {
        this.stateRepository = stateRepository;
        this.booking = booking;
        this.backup = backup;
        this.clock = clock;
    }

    getDashboard() {
        const authorized = this._authorizedState();
        if (!authorized.ok) return authorized;
        const state = authorized.value.state;
        const now = this.clock.now();
        const showtimeResult = this.booking.listShowtimes();
        if (!showtimeResult.ok) return showtimeResult;

        const contexts = showtimeResult.value;
        const showtimeLabels = new Map(contexts.map(context => [context.showtime.id, {
            movieTitle: context.movie.title,
            cinemaName: context.cinema.name,
            auditoriumName: context.auditorium.name,
            startsAt: context.showtime.startsAt
        }]));
        const showtimes = contexts.map(context => {
            const inventory = state.inventoriesByShowtime[context.showtime.id];
            const capacity = context.auditorium.seats.length;
            const soldCount = inventory?.soldSeatIds.length || 0;
            const heldCount = Object.keys(inventory?.holdIdsBySeatId || {}).length;
            return Object.freeze({
                id: context.showtime.id,
                movieTitle: context.movie.title,
                cinemaName: context.cinema.name,
                auditoriumName: context.auditorium.name,
                startsAt: context.showtime.startsAt,
                salesState: context.showtime.salesState,
                capacity,
                soldCount,
                heldCount,
                availableCount: Math.max(0, capacity - soldCount - heldCount),
                occupancyRate: capacity === 0 ? 0 : soldCount / capacity,
                inventoryRevision: inventory?.revision || 0,
                updatedAt: inventory?.updatedAt || state.updatedAt
            });
        });

        const holds = Object.values(state.holdsById)
            .map(hold => this._holdView(hold, state, showtimeLabels, now))
            .sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt));
        const activeHolds = holds.filter(hold => hold.active);
        const staleHolds = holds.filter(hold => hold.status === 'held' && !hold.active);
        const orders = Object.values(state.ordersById)
            .sort((left, right) => Date.parse(right.confirmedAt) - Date.parse(left.confirmedAt));
        const confirmedOrders = orders.filter(order => order.status === 'confirmed');
        const cancelledOrders = orders.filter(order => order.status === 'cancelled');
        const grossAmount = confirmedOrders.reduce((total, order) => total + order.pricingQuote.total.amount, 0);
        const pendingRefundAmount = cancelledOrders.reduce((total, order) =>
            total + (order.refund?.status === 'pending' ? order.refund.amount.amount : 0), 0);
        const users = Object.values(state.usersById)
            .filter(user => user.role !== 'system')
            .map(sanitizeUser)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

        return ok(Object.freeze({
            generatedAt: now,
            stateRevision: state.revision,
            operator: authorized.value.operator,
            summary: Object.freeze({
                showtimeCount: showtimes.length,
                orderCount: orders.length,
                confirmedOrderCount: confirmedOrders.length,
                cancelledOrderCount: cancelledOrders.length,
                activeHoldCount: activeHolds.length,
                staleHoldCount: staleHolds.length,
                userCount: users.length,
                grossRevenue: money(grossAmount),
                pendingRefunds: money(pendingRefundAmount)
            }),
            showtimes: Object.freeze(showtimes),
            holds: Object.freeze(holds),
            activeHolds: Object.freeze(activeHolds),
            recentOrders: Object.freeze(orders.slice(0, 8)),
            users: Object.freeze(users),
            migration: state.migration
        }));
    }

    sweepExpiredHolds() {
        const authorized = this._authorizedState();
        if (!authorized.ok) return authorized;
        return this.booking.sweepExpiredHolds();
    }

    releaseHold(holdId) {
        const authorized = this._authorizedState();
        if (!authorized.ok) return authorized;
        const state = authorized.value.state;
        const hold = state.holdsById[holdId];
        if (!hold) return err('HOLD_NOT_FOUND', '锁座记录不存在', { holdId });
        if (hold.status !== 'held') {
            return err('HOLD_STATE_INVALID', '只能人工释放 held 状态锁座', { status: hold.status });
        }
        const inventory = state.inventoriesByShowtime[hold.showtimeId];
        const released = releaseBookingHold({ hold, inventory }, {
            releasedAt: this.clock.now(),
            reason: 'operator-released'
        });
        if (!released.ok) return released;
        const persisted = this.stateRepository.update(state.revision, draft => {
            draft.holdsById[hold.id] = released.value.hold;
            draft.inventoriesByShowtime[hold.showtimeId] = released.value.inventory;
        });
        if (!persisted.ok) return persisted;
        return ok({
            hold: persisted.value.holdsById[hold.id],
            state: persisted.value
        });
    }

    exportBackup(options = {}) {
        const authorized = this._authorizedState();
        if (!authorized.ok) return authorized;
        return this.backup.export(options);
    }

    importBackup(jsonString) {
        const authorized = this._authorizedState();
        if (!authorized.ok) return authorized;
        return this.backup.import(jsonString);
    }

    _authorizedState() {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const userId = current.value.session?.userId;
        if (!userId) return err('AUTH_REQUIRED', '请先使用管理员账号登录');
        const user = current.value.usersById[userId];
        if (user?.role !== 'admin') return err('FORBIDDEN', '当前账户没有内部运维权限');
        return ok({
            state: current.value,
            operator: sanitizeUser(user)
        });
    }

    _holdView(hold, state, showtimeLabels, now) {
        const user = state.usersById[hold.ownerId];
        const showtime = showtimeLabels.get(hold.showtimeId) || {
            movieTitle: '历史场次',
            cinemaName: '影院未记录',
            auditoriumName: '影厅未记录',
            startsAt: null
        };
        return Object.freeze({
            id: hold.id,
            status: hold.status,
            active: isSeatHoldActive(hold, now),
            ownerLabel: user ? `${user.name}（${user.username}）` : '访客会话',
            showtimeId: hold.showtimeId,
            ...showtime,
            seatIds: hold.seatIds,
            requestedAt: hold.requestedAt,
            heldAt: hold.heldAt,
            expiresAt: hold.expiresAt,
            terminalAt: hold.terminalAt,
            releaseReason: hold.releaseReason
        });
    }
}

export default CommercialOperationsService;
