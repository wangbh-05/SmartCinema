/**
 * 推荐用例与 SeatData 适配器集成测试。
 */

import { SeatData } from '../src/core/SeatData.js';
import { recommendSeats } from '../src/application/recommendation/RecommendSeats.js';
import { snapshotSeatData } from '../src/ui/adapters/SeatDataLayoutAdapter.js';

class TestRecommendUseCase {
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
        console.log('\n========== 推荐用例集成测试 ==========\n');

        // 测试推荐
        this.test('应该能推荐座位', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'adult', 2, 'couple');
            this.assertTrue(result.ok);
        });

        this.test('应该能处理无效人数', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'adult', 30, 'couple');
            this.assertFalse(result.ok);
        });

        this.test('推荐结果应该包含座位信息', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'adult', 2, 'couple');
            if (result.ok) {
                this.assertTrue(result.value.seats.length > 0);
                this.assertTrue(result.value.reason.length > 0);
            }
        });

        this.test('少年推荐应该避开前三排', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'youth', 1, 'solo');
            this.assertTrue(result.ok);
            this.assertTrue(result.value.seats.every(seat => seat.row >= 3));
        });

        this.test('老年人推荐应该避开后三排', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'senior', 1, 'solo');
            this.assertTrue(result.ok);
            this.assertTrue(result.value.seats.every(seat => seat.row < data.rows - 3));
        });

        this.test('情侣推荐应该返回同排连续双座', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'adult', 2, 'couple');
            this.assertTrue(result.ok);
            this.assertEqual(result.value.seats.length, 2);
            this.assertEqual(result.value.seats[0].row, result.value.seats[1].row);
            this.assertEqual(result.value.seats[1].col, result.value.seats[0].col + 1);
        });

        this.test('家庭推荐应该返回指定人数的同排连续座位', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'adult', 4, 'family');
            this.assertTrue(result.ok);
            this.assertEqual(result.value.seats.length, 4);
            this.assertTrue(this._isSameRowConsecutive(result.value.seats));
        });

        this.test('5人团体推荐应该成功且同排连续', () => {
            const data = new SeatData('medium');
            const result = this._recommend(data, 'adult', 5, 'group');
            this.assertTrue(result.ok);
            this.assertEqual(result.value.seats.length, 5);
            this.assertTrue(this._isSameRowConsecutive(result.value.seats));
        });

        return this.printSummary();
    }

    _recommend(data, ageGroup, groupSize, movieType) {
        return recommendSeats(snapshotSeatData(data), { ageGroup, groupSize, movieType });
    }

    _isSameRowConsecutive(seats) {
        if (seats.length === 0) return false;
        const sorted = [...seats].sort((a, b) => a.col - b.col);
        const row = sorted[0].row;
        return sorted.every((seat, index) =>
            seat.row === row && seat.col === sorted[0].col + index
        );
    }

    assertFalse(value, message = '') {
        if (value) {
            throw new Error(`Expected false, got ${value}. ${message}`);
        }
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestRecommendUseCase;
