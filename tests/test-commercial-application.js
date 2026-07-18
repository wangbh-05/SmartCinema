import { CommercialBookingService } from '../src/application/commercial/CommercialBookingService.js';
import { createSettings } from '../src/domain/user/Settings.js';
import { createUser } from '../src/domain/user/User.js';
import {
    createDemoCatalog,
    DemoCatalogRepository
} from '../src/infrastructure/catalog/DemoCatalogRepository.js';
import { LocalStateRepositoryV3 } from '../src/infrastructure/storage/LocalStateRepositoryV3.js';
import { createDefaultStateV3 } from '../src/infrastructure/storage/StorageValidatorV3.js';

const NOW = '2026-07-18T02:00:00.000Z';

class MemoryWebStorage {
    constructor() {
        this.data = new Map();
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
    }
}

class FakeClock {
    constructor(value = NOW) {
        this.value = value;
    }

    now() {
        return this.value;
    }
}

class SequenceIdGenerator {
    constructor() {
        this.index = 0;
    }

    next(prefix) {
        this.index++;
        return `${prefix}-${this.index}`;
    }
}

class TestCommercialApplication {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✓ ${name}`);
        } catch (error) {
            this.failed++;
            console.error(`✗ ${name}`, error.message);
        }
    }

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    assertFalse(value, message = '') {
        if (value) throw new Error(`Expected false. ${message}`);
    }

    runAll() {
        console.log('\n========== Commercial Booking Application 测试 ==========\n');

        this.test('场次上下文应组合电影、影院、影厅、价格与退改政策', () => {
            const deps = this._deps();
            const context = deps.service.getBookingContext(deps.showtimeId);
            this.assertTrue(context.ok);
            this.assertEqual(context.value.movie.title, '星际回响');
            this.assertEqual(context.value.cinema.name, 'SmartCinema 光影中心');
            this.assertEqual(context.value.ticketTypes.length, 4);
            this.assertTrue(context.value.priceFrom > 0);
        });

        this.test('应用层应创建票种草稿并原子持久化 hold 与库存', () => {
            const deps = this._deps();
            const draft = this._completeDraft(deps);
            const placed = deps.service.placeHold({
                draft,
                ownerId: 'user-1',
                idempotencyKey: 'request-1'
            });
            this.assertTrue(placed.ok);
            this.assertEqual(placed.value.hold.status, 'held');
            const persisted = deps.repository.read().value;
            this.assertTrue(Boolean(persisted.holdsById[placed.value.hold.id]));
            this.assertEqual(
                persisted.inventoriesByShowtime[deps.showtimeId].holdIdsBySeatId['A-01'],
                placed.value.hold.id
            );
        });

        this.test('同一 idempotencyKey 应返回原 hold，不产生第二次占座', () => {
            const deps = this._deps();
            const draft = this._completeDraft(deps);
            const first = deps.service.placeHold({ draft, ownerId: 'user-1', idempotencyKey: 'request-1' });
            const second = deps.service.placeHold({ draft, ownerId: 'user-1', idempotencyKey: 'request-1' });
            this.assertTrue(first.ok && second.ok);
            this.assertTrue(second.value.idempotent);
            this.assertEqual(second.value.hold.id, first.value.hold.id);
            this.assertEqual(Object.keys(deps.repository.read().value.holdsById).length, 1);
        });

        this.test('已成功的幂等锁座在场次停止售票后仍应返回原结果', () => {
            const deps = this._deps();
            deps.clock.value = '2026-07-18T04:29:00.000Z';
            const draft = this._completeDraft(deps);
            const first = deps.service.placeHold({
                draft,
                ownerId: 'user-1',
                idempotencyKey: 'request-near-close',
                holdDurationSeconds: 600
            });
            this.assertTrue(first.ok);
            deps.clock.value = '2026-07-18T04:31:00.000Z';
            const second = deps.service.placeHold({
                draft,
                ownerId: 'user-1',
                idempotencyKey: 'request-near-close',
                holdDurationSeconds: 600
            });
            this.assertTrue(second.ok);
            this.assertTrue(second.value.idempotent);
            this.assertEqual(second.value.hold.id, first.value.hold.id);
        });

        this.test('第二个用户不得 hold 已被保留的座位', () => {
            const deps = this._deps();
            const draft = this._completeDraft(deps);
            const first = deps.service.placeHold({ draft, ownerId: 'user-1', idempotencyKey: 'request-1' });
            this.assertTrue(first.ok);
            const conflict = deps.service.placeHold({
                draft,
                ownerId: 'guest:other-session',
                idempotencyKey: 'request-2'
            });
            this.assertFalse(conflict.ok);
            this.assertEqual(conflict.error.code, 'SEAT_UNAVAILABLE');
        });

        this.test('release 应校验 owner 并重新释放整组座位', () => {
            const deps = this._deps();
            const placed = deps.service.placeHold({
                draft: this._completeDraft(deps),
                ownerId: 'user-1',
                idempotencyKey: 'request-1'
            }).value;
            const forbidden = deps.service.releaseHold({
                holdId: placed.hold.id,
                actorOwnerId: 'guest:wrong'
            });
            this.assertEqual(forbidden.error.code, 'FORBIDDEN');
            const released = deps.service.releaseHold({
                holdId: placed.hold.id,
                actorOwnerId: 'user-1',
                reason: 'change-seats'
            });
            this.assertTrue(released.ok);
            this.assertEqual(released.value.hold.status, 'released');
            this.assertEqual(
                Object.keys(released.value.state.inventoriesByShowtime[deps.showtimeId].holdIdsBySeatId).length,
                0
            );
        });

        this.test('expire 应在到期后释放库存并保存终态', () => {
            const deps = this._deps();
            const placed = deps.service.placeHold({
                draft: this._completeDraft(deps),
                ownerId: 'user-1',
                idempotencyKey: 'request-1',
                holdDurationSeconds: 60
            }).value;
            deps.clock.value = '2026-07-18T02:01:00.000Z';
            const expired = deps.service.expireHold(placed.hold.id);
            this.assertTrue(expired.ok);
            this.assertEqual(expired.value.hold.status, 'expired');
            this.assertEqual(
                Object.keys(expired.value.state.inventoriesByShowtime[deps.showtimeId].holdIdsBySeatId).length,
                0
            );
        });

        this.test('访客 hold 可在同一会话登录后确认并生成不可变订单快照', () => {
            const deps = this._deps();
            const placed = deps.service.placeHold({
                draft: this._completeDraft(deps),
                ownerId: 'guest:checkout-session',
                idempotencyKey: 'request-1'
            }).value;
            const confirmed = deps.service.confirmHold({
                holdId: placed.hold.id,
                actorOwnerId: 'guest:checkout-session',
                userId: 'user-1'
            });
            this.assertTrue(confirmed.ok);
            this.assertEqual(confirmed.value.order.userId, 'user-1');
            this.assertEqual(confirmed.value.order.movieSnapshot.title, '星际回响');
            this.assertEqual(confirmed.value.order.seatSnapshots.length, 2);
            this.assertEqual(confirmed.value.state.holdsById[placed.hold.id].status, 'consumed');
            this.assertEqual(
                confirmed.value.state.inventoriesByShowtime[deps.showtimeId].soldSeatIds.length,
                2
            );
        });

        this.test('重复确认 consumed hold 应返回同一订单', () => {
            const deps = this._deps();
            const placed = deps.service.placeHold({
                draft: this._completeDraft(deps),
                ownerId: 'user-1',
                idempotencyKey: 'request-1'
            }).value;
            const first = deps.service.confirmHold({
                holdId: placed.hold.id,
                actorOwnerId: 'user-1',
                userId: 'user-1'
            });
            const second = deps.service.confirmHold({
                holdId: placed.hold.id,
                actorOwnerId: 'user-1',
                userId: 'user-1'
            });
            this.assertTrue(first.ok && second.ok);
            this.assertTrue(second.value.idempotent);
            this.assertEqual(second.value.order.id, first.value.order.id);
            this.assertEqual(Object.keys(deps.repository.read().value.ordersById).length, 1);
        });

        this.test('取消自己的订单应原子更新退款终态与场次库存', () => {
            const deps = this._deps();
            const confirmed = this._confirmOrder(deps);
            const eligibility = deps.service.getOrderCancellationEligibility({
                orderId: confirmed.id,
                actorUserId: 'user-1'
            });
            this.assertTrue(eligibility.ok && eligibility.value.eligible);
            const cancelled = deps.service.cancelOrder({
                orderId: confirmed.id,
                actorUserId: 'user-1'
            });
            this.assertTrue(cancelled.ok, cancelled.error?.message);
            this.assertEqual(cancelled.value.order.status, 'cancelled');
            this.assertEqual(cancelled.value.order.refund.status, 'pending');
            this.assertEqual(
                cancelled.value.state.inventoriesByShowtime[deps.showtimeId].soldSeatIds.length,
                0
            );
        });

        this.test('退票必须校验订单所有者且重复取消保持幂等', () => {
            const deps = this._deps();
            const confirmed = this._confirmOrder(deps);
            const forbidden = deps.service.cancelOrder({
                orderId: confirmed.id,
                actorUserId: 'admin-1'
            });
            this.assertEqual(forbidden.error.code, 'FORBIDDEN');
            const first = deps.service.cancelOrder({ orderId: confirmed.id, actorUserId: 'user-1' });
            const second = deps.service.cancelOrder({ orderId: confirmed.id, actorUserId: 'user-1' });
            this.assertTrue(first.ok && second.ok);
            this.assertTrue(second.value.idempotent);
            this.assertEqual(second.value.order.refund.amount.amount, first.value.order.refund.amount.amount);
        });

        this.test('超过政策截止时间应拒绝退款且库存继续保持已售', () => {
            const deps = this._deps();
            const confirmed = this._confirmOrder(deps);
            deps.clock.value = '2026-07-18T03:41:00.000Z';
            const eligibility = deps.service.getOrderCancellationEligibility({
                orderId: confirmed.id,
                actorUserId: 'user-1'
            });
            this.assertFalse(eligibility.value.eligible);
            this.assertEqual(eligibility.value.code, 'CUTOFF_PASSED');
            const cancelled = deps.service.cancelOrder({
                orderId: confirmed.id,
                actorUserId: 'user-1'
            });
            this.assertFalse(cancelled.ok);
            this.assertEqual(cancelled.error.code, 'REFUND_NOT_ELIGIBLE');
            this.assertEqual(deps.repository.read().value.ordersById[confirmed.id].status, 'confirmed');
            this.assertEqual(
                deps.repository.read().value.inventoriesByShowtime[deps.showtimeId].soldSeatIds.length,
                2
            );
        });

        return this.printSummary();
    }

    _completeDraft(deps) {
        const draft = deps.service.createDraft({
            showtimeId: deps.showtimeId,
            ticketItems: [{ ticketTypeId: 'adult', quantity: 2 }],
            preferences: ['center']
        });
        this.assertTrue(draft.ok);
        const selected = deps.service.replaceSeats(draft.value, ['A-01', 'A-02']);
        this.assertTrue(selected.ok);
        return selected.value;
    }

    _confirmOrder(deps) {
        const placed = deps.service.placeHold({
            draft: this._completeDraft(deps),
            ownerId: 'user-1',
            idempotencyKey: 'request-cancel'
        }).value;
        const confirmed = deps.service.confirmHold({
            holdId: placed.hold.id,
            actorOwnerId: 'user-1',
            userId: 'user-1'
        });
        this.assertTrue(confirmed.ok, confirmed.error?.message);
        return confirmed.value.order;
    }

    _deps() {
        const storage = new MemoryWebStorage();
        const clock = new FakeClock();
        const admin = createUser({
            id: 'admin-1',
            username: 'admin',
            credential: { kind: 'demo-plaintext', value: 'admin123' },
            name: '管理员',
            email: '',
            role: 'admin',
            createdAt: NOW
        });
        const user = createUser({
            id: 'user-1',
            username: 'alice',
            credential: { kind: 'demo-plaintext', value: 'secret1' },
            name: 'Alice',
            email: 'alice@example.test',
            role: 'member',
            createdAt: NOW
        });
        const state = JSON.parse(JSON.stringify(createDefaultStateV3(NOW, admin)));
        state.usersById[user.id] = user;
        state.settingsByUser[user.id] = createSettings();
        const repository = new LocalStateRepositoryV3({ storage, clock });
        const initialized = repository.initialize(state);
        this.assertTrue(initialized.ok);
        const catalog = createDemoCatalog('2026-07-18');
        const catalogRepository = new DemoCatalogRepository(catalog);
        const showtimeId = catalogRepository.listShowtimes()[0].id;
        const service = new CommercialBookingService({
            catalogRepository,
            stateRepository: repository,
            clock,
            idGenerator: new SequenceIdGenerator()
        });
        return { storage, clock, repository, catalogRepository, showtimeId, service };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestCommercialApplication;
