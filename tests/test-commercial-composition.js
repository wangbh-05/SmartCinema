import { createBrowserCommercialApplication } from '../src/bootstrapCommercial.js';
import {
    bookableBusinessDateInTimeZone,
    businessDateInTimeZone
} from '../src/infrastructure/browser/BusinessDate.js';

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

    set(value) {
        this.value = value;
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

export default class TestCommercialComposition {
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

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }

    runAll() {
        console.log('\n========== Commercial Composition 测试 ==========\n');

        this.test('空白浏览器应连续初始化 v2、v3 与三日目录库存', () => {
            const deps = this._deps();
            const initialized = deps.app.initialize();
            this.assertTrue(initialized.ok);
            this.assertEqual(initialized.value.createdInventories, 24);
            this.assertEqual(Object.keys(initialized.value.state.inventoriesByShowtime).length, 24);
            this.assertTrue(deps.localStorage.getItem('smartcinema_state_v2') !== null);
            this.assertTrue(deps.localStorage.getItem('smartcinema_state_v3') !== null);
        });

        this.test('营业日应使用上海日期并在末场停售后切到次日', () => {
            this.assertEqual(businessDateInTimeZone('2026-07-18T13:59:00.000Z'), '2026-07-18');
            this.assertEqual(bookableBusinessDateInTimeZone('2026-07-18T13:59:00.000Z'), '2026-07-18');
            this.assertEqual(bookableBusinessDateInTimeZone('2026-07-18T14:00:00.000Z'), '2026-07-19');
        });

        this.test('v3 账户服务应完成注册、退出与登录且保持单一状态源', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            const registered = deps.app.account.register({
                username: 'viewer',
                password: 'secret1',
                name: '观众',
                email: 'viewer@example.test'
            });
            this.assertTrue(registered.ok);
            this.assertEqual(deps.app.account.getCurrentUser().username, 'viewer');
            this.assertTrue(deps.app.account.logout().ok);
            this.assertTrue(deps.app.account.login('viewer', 'secret1').ok);
            this.assertEqual(deps.app.account.getCurrentUser().name, '观众');
        });

        this.test('消费者辅助偏好应通过应用服务持久化到 guest 单一状态源', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            const updated = deps.app.preferences.update({
                accessibilityMode: true,
                colorblindMode: true,
                reducedMotion: 'reduce'
            });
            this.assertTrue(updated.ok);
            const settings = deps.app.preferences.get();
            this.assertTrue(settings.ok);
            this.assertTrue(settings.value.accessibilityMode);
            this.assertTrue(settings.value.colorblindMode);
            this.assertEqual(settings.value.reducedMotion, 'reduce');
        });

        this.test('登录账户与访客辅助偏好应隔离并在退出后恢复访客设置', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            this.assertTrue(deps.app.preferences.update({ accessibilityMode: true }).ok);
            this.assertTrue(deps.app.preferences.update({ highContrastMode: true }).ok);
            this.assertTrue(deps.app.account.register({
                username: 'preferences-viewer',
                password: 'secret1',
                name: '偏好观众',
                email: ''
            }).ok);
            this.assertTrue(deps.app.preferences.get().value.accessibilityMode);
            this.assertTrue(deps.app.preferences.get().value.highContrastMode);
            this.assertTrue(deps.app.preferences.update({
                accessibilityMode: false,
                highContrastMode: false,
                reducedMotion: 'reduce'
            }).ok);
            this.assertTrue(deps.app.account.logout().ok);
            this.assertTrue(deps.app.preferences.get().value.accessibilityMode);
            this.assertEqual(deps.app.preferences.get().value.reducedMotion, 'system');
        });

        this.test('推荐应返回合法连座并可由同一应用服务报价', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            const showtimeId = deps.app.booking.listShowtimes().value[0].showtime.id;
            const draft = deps.app.booking.createDraft({
                showtimeId,
                ticketItems: [{ ticketTypeId: 'adult', quantity: 2 }],
                preferences: ['center']
            });
            this.assertTrue(draft.ok);
            const recommended = deps.app.booking.recommendSeats(draft.value);
            this.assertTrue(recommended.ok, recommended.error?.message);
            this.assertEqual(recommended.value.draft.selectedSeatIds.length, 2);
            const quote = deps.app.booking.quoteDraft(recommended.value.draft);
            this.assertTrue(quote.ok);
            this.assertTrue(quote.value.total.amount > 0);
        });

        this.test('session 草稿仓储应验证、保存、恢复并清除 BookingDraft', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            const showtimeId = deps.app.booking.listShowtimes().value[0].showtime.id;
            const draft = deps.app.booking.createDraft({
                showtimeId,
                ticketItems: [{ ticketTypeId: 'adult', quantity: 2 }],
                preferences: ['aisle']
            });
            this.assertTrue(draft.ok);
            const recommended = deps.app.booking.recommendSeats(draft.value);
            this.assertTrue(recommended.ok);
            this.assertTrue(deps.app.bookingDrafts.save(recommended.value.draft).ok);
            const restored = deps.app.bookingDrafts.get();
            this.assertTrue(restored.ok);
            this.assertEqual(restored.value.showtimeId, showtimeId);
            this.assertEqual(restored.value.selectedSeatIds.length, 2);
            this.assertTrue(deps.app.bookingDrafts.clear().ok);
            this.assertEqual(deps.app.bookingDrafts.get().value, null);
        });

        this.test('有效锁座应在同一浏览器会话的新 composition root 中恢复', () => {
            const localStorage = new MemoryWebStorage();
            const sessionStorage = new MemoryWebStorage();
            const clock = new FakeClock();
            const first = this._deps({ localStorage, sessionStorage, clock });
            this.assertTrue(first.app.initialize().ok);
            const held = this._placeRecommendedHold(first.app);

            const second = this._deps({ localStorage, sessionStorage, clock });
            const initialized = second.app.initialize();
            this.assertTrue(initialized.ok);
            this.assertEqual(initialized.value.expiredHolds, 0);
            const restored = second.app.booking.findActiveHold(second.app.getBookingOwnerIds());
            this.assertTrue(restored.ok);
            this.assertEqual(restored.value.id, held.id);
            this.assertEqual(restored.value.ownerId, held.ownerId);
        });

        this.test('initialize 应原子清扫过期锁座并释放对应库存', () => {
            const localStorage = new MemoryWebStorage();
            const sessionStorage = new MemoryWebStorage();
            const clock = new FakeClock();
            const first = this._deps({ localStorage, sessionStorage, clock });
            this.assertTrue(first.app.initialize().ok);
            const held = this._placeRecommendedHold(first.app);
            clock.set('2026-07-18T02:11:00.000Z');

            const second = this._deps({ localStorage, sessionStorage, clock });
            const initialized = second.app.initialize();
            this.assertTrue(initialized.ok, initialized.error?.message);
            this.assertEqual(initialized.value.expiredHolds, 1);
            const state = initialized.value.state;
            this.assertEqual(state.holdsById[held.id].status, 'expired');
            const inventory = state.inventoriesByShowtime[held.showtimeId];
            this.assertTrue(held.seatIds.every(seatId => !inventory.holdIdsBySeatId[seatId]));
            this.assertEqual(second.app.booking.findActiveHold(second.app.getBookingOwnerIds()).value, null);
        });

        return this.printSummary();
    }

    _placeRecommendedHold(app) {
        const showtimeId = app.booking.listShowtimes().value[0].showtime.id;
        const draft = app.booking.createDraft({
            showtimeId,
            ticketItems: [{ ticketTypeId: 'adult', quantity: 2 }],
            preferences: ['center']
        });
        const recommended = app.booking.recommendSeats(draft.value);
        const held = app.booking.placeHold({
            draft: recommended.value.draft,
            ownerId: app.getBookingOwnerId(),
            idempotencyKey: app.booking.createHoldRequestKey(),
            holdDurationSeconds: 600
        });
        this.assertTrue(held.ok, held.error?.message);
        return held.value.hold;
    }

    _deps({
        localStorage = new MemoryWebStorage(),
        sessionStorage = new MemoryWebStorage(),
        clock = new FakeClock(),
        idGenerator = new SequenceIdGenerator()
    } = {}) {
        const app = createBrowserCommercialApplication({
            localStorage,
            sessionStorage,
            clock,
            idGenerator,
            businessDate: '2026-07-18'
        });
        return { app, localStorage, sessionStorage, clock, idGenerator };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}
