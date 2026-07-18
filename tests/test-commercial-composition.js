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
    now() {
        return NOW;
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

        this.test('空白浏览器应连续初始化 v2、v3 与四个场次库存', () => {
            const deps = this._deps();
            const initialized = deps.app.initialize();
            this.assertTrue(initialized.ok);
            this.assertEqual(initialized.value.createdInventories, 4);
            this.assertEqual(Object.keys(initialized.value.state.inventoriesByShowtime).length, 4);
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

        return this.printSummary();
    }

    _deps() {
        const localStorage = new MemoryWebStorage();
        const sessionStorage = new MemoryWebStorage();
        const app = createBrowserCommercialApplication({
            localStorage,
            sessionStorage,
            clock: new FakeClock(),
            idGenerator: new SequenceIdGenerator(),
            businessDate: '2026-07-18'
        });
        return { app, localStorage, sessionStorage };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}
