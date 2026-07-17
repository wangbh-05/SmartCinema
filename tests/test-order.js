/**
 * 单元测试 - OrderManager 模块
 */

import { SeatData } from '../src/core/SeatData.js';
import { OrderManager } from '../src/modules/OrderManager.js';

class MemoryStorage {
    constructor() {
        this.data = {};
    }

    loadOrders() {
        return this.data.orders || [];
    }

    save(key, value) {
        this.data[key] = value;
        return true;
    }
}

class TestOrderManager {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✓ ${name}`);
            return true;
        } catch (error) {
            this.failed++;
            console.error(`✗ ${name}`, error.message);
            return false;
        }
    }

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
        }
    }

    assertTrue(value, message = '') {
        if (!value) {
            throw new Error(`Expected true, got ${value}. ${message}`);
        }
    }

    runAll() {
        console.log('\n========== OrderManager 模块测试 ==========\n');

        this.test('应该能创建待确认订单', () => {
            const manager = new OrderManager(new MemoryStorage());
            const seats = this._sampleSeats();
            const result = manager.createOrder(seats, { name: '测试用户' });

            this.assertTrue(result.success);
            this.assertEqual(result.order.status, 'pending');
            this.assertEqual(result.order.seatCount, seats.length);
            this.assertTrue(result.order.totalPrice > 0);
        });

        this.test('应该能确认订单', () => {
            const manager = new OrderManager(new MemoryStorage());
            const result = manager.createOrder(this._sampleSeats(), { name: '测试用户' });
            const confirmed = manager.confirmOrder(result.order.id);

            this.assertTrue(confirmed.success);
            this.assertEqual(confirmed.order.status, 'confirmed');
            this.assertTrue(Boolean(confirmed.order.confirmTime));
        });

        this.test('应该能取消已确认订单并记录退款', () => {
            const manager = new OrderManager(new MemoryStorage());
            const result = manager.createOrder(this._sampleSeats(), { name: '测试用户' });
            manager.confirmOrder(result.order.id);
            const cancelled = manager.cancelOrder(result.order.id, '用户退票');

            this.assertTrue(cancelled.success);
            this.assertEqual(cancelled.order.status, 'cancelled');
            this.assertEqual(cancelled.order.refundAmount, cancelled.order.totalPrice);
            this.assertEqual(cancelled.order.refundStatus, 'pending');
        });

        this.test('统计信息应该反映订单状态', () => {
            const manager = new OrderManager(new MemoryStorage());
            const result = manager.createOrder(this._sampleSeats(), { name: '测试用户' });
            manager.confirmOrder(result.order.id);
            const stats = manager.getStatistics();

            this.assertEqual(stats.totalOrders, 1);
            this.assertEqual(stats.confirmedOrders, 1);
            this.assertEqual(stats.pendingOrders, 0);
            this.assertTrue(stats.totalRevenue > 0);
        });

        return this.printSummary();
    }

    _sampleSeats() {
        const data = new SeatData('small');
        const seats = data.findConsecutiveInRow(5, 2);
        this.assertTrue(seats && seats.length === 2);
        seats.forEach(seat => data.selectSeat(seat.row, seat.col));
        return data.getSelectedSeats();
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestOrderManager;
