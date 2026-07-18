/**
 * AppController 组合与状态同步测试。
 */

import { createBrowserAppController } from '../src/bootstrap.js';

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

class TestAppController {
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
        console.log('\n========== AppController 测试 ==========\n');

        this.test('bootstrap 应完成空白迁移并创建初始 AppState', () => {
            const controller = this._controller();
            const initialized = controller.initialize('medium:day:0');
            this.assertTrue(initialized.ok);
            this.assertEqual(controller.getState().showtimeId, 'medium:day:0');
            this.assertEqual(controller.getState().selection.seatKeys.length, 0);
        });

        this.test('认证与设置更新应同步到同一 AppState', () => {
            const controller = this._controller();
            controller.initialize();
            const registered = controller.register({
                username: 'alice',
                password: 'secret1',
                name: 'Alice',
                email: 'alice@example.test'
            });
            this.assertTrue(registered.ok);
            this.assertTrue(controller.isLoggedIn());
            const updated = controller.updateSettings({ voiceEnabled: true });
            this.assertTrue(updated.ok);
            this.assertTrue(controller.getState().settings.voiceEnabled);
            this.assertEqual(controller.getState().session.userId, registered.value.user.id);
        });

        this.test('订单确认应同步库存且保持结算幂等', () => {
            const controller = this._controller();
            controller.initialize();
            controller.register({
                username: 'alice',
                password: 'secret1',
                name: 'Alice'
            });
            const started = controller.startCheckout({
                showtimeId: 'medium:day:3',
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }]
            });
            this.assertTrue(started.ok);
            const first = controller.confirmCheckout();
            const second = controller.confirmCheckout();
            this.assertEqual(first.value.order.id, second.value.order.id);
            this.assertTrue(controller.getState().inventory.soldSeatKeys.includes('5-8'));
        });

        this.test('导入备份应清除登录、结算和全部 UI 暂态', () => {
            const controller = this._controller();
            controller.initialize();
            controller.register({
                username: 'alice',
                password: 'secret1',
                name: 'Alice'
            });
            const exported = controller.exportBackup({ includeCredentials: true });
            this.assertTrue(exported.ok);

            controller.toggleSeat('5-8');
            controller.applyRemoteHold({
                type: 'hold',
                id: 'hold-1',
                showtimeId: 'medium:day:3',
                seatKey: '5-9',
                ownerLabel: '远端用户',
                expiresAt: '2026-07-18T00:05:00.000Z'
            });
            controller.startCheckout({
                showtimeId: 'medium:day:3',
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }]
            });

            const imported = controller.importBackup(exported.value.json);
            this.assertTrue(imported.ok);
            this.assertEqual(controller.getState().session, null);
            this.assertEqual(controller.getState().selection.seatKeys.length, 0);
            this.assertEqual(controller.getState().remoteHoldsBySeatKey.size, 0);
            this.assertEqual(controller.getCheckoutIntent().error.code, 'CHECKOUT_NOT_FOUND');
        });

        return this.printSummary();
    }

    _controller() {
        let sequence = 0;
        return createBrowserAppController({
            localStorage: new MemoryWebStorage(),
            sessionStorage: new MemoryWebStorage(),
            clock: { now: () => NOW },
            idGenerator: { next: prefix => `${prefix}-${++sequence}` }
        });
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestAppController;
