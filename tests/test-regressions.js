/**
 * 已修复的状态类缺陷回归测试。
 *
 * 这些契约只面向生产使用的 v2 AppController，不再探测已经退出生产路径的旧模块。
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

class TestRegressionContracts {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    test(id, name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✓ ${id} ${name}`);
        } catch (error) {
            this.failed++;
            console.error(`✗ ${id} ${name}：${error.message}`);
        }
    }

    assertEqual(actual, expected) {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    runAll() {
        console.log('\n========== 已修复缺陷回归测试 ==========\n');

        this.test('BUG-002', '订单必须按稳定 userId 隔离', () => {
            const controller = this._controller();
            controller.register({ username: 'alice', password: 'secret1', name: '用户 A' });
            controller.startCheckout({
                showtimeId: 'medium:day:3',
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }]
            });
            controller.confirmCheckout();
            controller.logout();
            controller.register({ username: 'bobby', password: 'secret2', name: '用户 B' });

            const userBOrders = controller.listOrders({ scope: 'mine' });
            this.assertTrue(userBOrders.ok);
            this.assertEqual(userBOrders.value.length, 0);
        });

        this.test('BUG-004', '远端临时占座不得写入本地选择', () => {
            const controller = this._controller();
            controller.replaceSelection(['5-8']);
            const held = controller.applyRemoteHold({
                type: 'hold',
                id: 'remote-1',
                showtimeId: 'medium:day:3',
                seatKey: '5-9',
                ownerLabel: '观众 B',
                expiresAt: '2026-07-18T00:01:00.000Z'
            });

            this.assertTrue(held.ok);
            this.assertEqual(controller.getState().selection.seatKeys.join(','), '5-8');
            this.assertTrue(controller.getState().remoteHoldsBySeatKey.has('5-9'));
        });

        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${this.passed + this.failed} | 通过: ${this.passed} | 失败: ${this.failed}\n`);
        return {
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed
        };
    }

    _controller() {
        let sequence = 0;
        const controller = createBrowserAppController({
            localStorage: new MemoryWebStorage(),
            sessionStorage: new MemoryWebStorage(),
            clock: { now: () => NOW },
            idGenerator: { next: prefix => `${prefix}-${++sequence}` }
        });
        controller.initialize('medium:day:3');
        return controller;
    }
}

export default TestRegressionContracts;
