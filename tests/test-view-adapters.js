import { createBrowserAppController } from '../src/bootstrap.js';
import { AuthViewAdapter } from '../src/ui/adapters/AuthViewAdapter.js';
import { OrderViewAdapter } from '../src/ui/adapters/OrderViewAdapter.js';

const NOW = '2026-07-18T00:00:00.000Z';

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

class TestViewAdapters {
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

    assertEqual(actual, expected) {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    runAll() {
        console.log('\n========== UI View Adapter 测试 ==========\n');

        this.test('认证适配器应返回稳定 UI 结果并使用 v2 session', () => {
            const { controller } = this._context();
            const auth = new AuthViewAdapter(controller);
            const registered = auth.register({
                username: 'alice',
                password: 'secret1',
                name: 'Alice'
            });
            this.assertTrue(registered.success);
            this.assertEqual(auth.getCurrentUser().id, registered.user.id);
            this.assertTrue(auth.logout().success);
            this.assertEqual(auth.getCurrentUser(), null);
        });

        this.test('普通用户不得经视图适配器看到其他用户订单', () => {
            const { controller } = this._context();
            const auth = new AuthViewAdapter(controller);
            const orders = new OrderViewAdapter(controller);
            auth.register({ username: 'alice', password: 'secret1', name: 'Alice' });
            controller.startCheckout({
                showtimeId: 'medium:day:3',
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }]
            });
            controller.confirmCheckout();
            auth.logout();
            auth.register({ username: 'bobby', password: 'secret2', name: 'Bob' });
            this.assertEqual(orders.getOrders().length, 0);
        });

        this.test('订单适配器应投影视图字段并通过 v2 原子退票', () => {
            const { controller } = this._context();
            const auth = new AuthViewAdapter(controller);
            const orders = new OrderViewAdapter(controller);
            auth.register({ username: 'alice', password: 'secret1', name: 'Alice' });
            controller.startCheckout({
                showtimeId: 'medium:day:3',
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }]
            });
            const confirmed = controller.confirmCheckout();
            const projected = orders.getOrder(confirmed.value.order.id);
            this.assertEqual(projected.hallType, 'medium');
            this.assertEqual(projected.seats[0].price, 120);
            this.assertTrue(orders.cancelOrder(projected.id, '退票').success);
            this.assertEqual(controller.getState().inventory.soldSeatKeys.length, 0);
        });

        this.test('只有管理员可经认证适配器获取用户列表', () => {
            const { controller } = this._context();
            const auth = new AuthViewAdapter(controller);
            auth.register({ username: 'alice', password: 'secret1', name: 'Alice' });
            this.assertEqual(auth.getAllUsers().length, 0);
            auth.logout();
            auth.login('admin', 'admin123');
            this.assertTrue(auth.getAllUsers().some(user => user.username === 'alice'));
        });

        return this.printSummary();
    }

    _context() {
        let sequence = 0;
        const controller = createBrowserAppController({
            localStorage: new MemoryWebStorage(),
            sessionStorage: new MemoryWebStorage(),
            clock: { now: () => NOW },
            idGenerator: { next: prefix => `${prefix}-${++sequence}` }
        });
        controller.initialize();
        return { controller };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestViewAdapters;
