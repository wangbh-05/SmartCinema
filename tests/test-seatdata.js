/**
 * 单元测试 - SeatData 模块
 */

import { SeatData } from '../src/core/SeatData.js';

class TestSeatData {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    /**
     * 初始化测试
     */
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

    /**
     * 断言相等
     */
    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
        }
    }

    /**
     * 断言为真
     */
    assertTrue(value, message = '') {
        if (!value) {
            throw new Error(`Expected true, got ${value}. ${message}`);
        }
    }

    /**
     * 断言为假
     */
    assertFalse(value, message = '') {
        if (value) {
            throw new Error(`Expected false, got ${value}. ${message}`);
        }
    }

    /**
     * 运行所有测试
     */
    runAll() {
        console.log('\n========== SeatData 模块测试 ==========\n');

        // 测试初始化
        this.test('应该初始化指定行列的座位', () => {
            const data = new SeatData(5, 10);
            this.assertEqual(data.rows, 5);
            this.assertEqual(data.cols, 10);
        });

        // 测试获取座位
        this.test('应该能获取有效座位', () => {
            const data = new SeatData(5, 10);
            const seat = data.getSeat(0, 0);
            this.assertTrue(seat !== null);
        });

        this.test('应该返回 null 获取无效座位', () => {
            const data = new SeatData(5, 10);
            const seat = data.getSeat(10, 10);
            this.assertEqual(seat, null);
        });

        // 测试座位选择
        this.test('应该能选择可用座位', () => {
            const data = new SeatData(5, 10);
            // 找一个可用座位
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 10; c++) {
                    if (data.isSeatAvailable(r, c)) {
                        const result = data.selectSeat(r, c);
                        this.assertTrue(result);
                        this.assertTrue(data.getSeat(r, c).isSelected);
                        return;
                    }
                }
            }
        });

        // 测试座位统计
        this.test('应该能统计座位', () => {
            const data = new SeatData(5, 10);
            const stats = data.getStats();
            this.assertEqual(stats.total, 50);
            this.assertTrue(stats.available >= 0);
            this.assertTrue(stats.occupied >= 0);
        });

        // 测试清空选择
        this.test('应该能清空所有选择', () => {
            const data = new SeatData(5, 10);
            // 选择一些座位
            for (let r = 0; r < 2; r++) {
                for (let c = 0; c < 2; c++) {
                    data.selectSeat(r, c);
                }
            }
            data.clearSelection();
            this.assertEqual(data.selectedSeats.size, 0);
        });

        this.printSummary();
    }

    /**
     * 打印测试摘要
     */
    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestSeatData;
