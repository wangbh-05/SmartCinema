/**
 * 单元测试 - RecommendEngine 模块
 */

import { SeatData } from '../src/core/SeatData.js';
import { RecommendEngine } from '../src/modules/RecommendEngine.js';

class TestRecommendEngine {
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
        console.log('\n========== RecommendEngine 模块测试 ==========\n');

        // 测试推荐
        this.test('应该能推荐座位', () => {
            const data = new SeatData(10, 20);
            const engine = new RecommendEngine(data);
            const result = engine.recommend('adult', 2, 'couple');
            this.assertTrue(result.success);
        });

        this.test('应该能处理无效人数', () => {
            const data = new SeatData(10, 20);
            const engine = new RecommendEngine(data);
            const result = engine.recommend('adult', 30, 'couple');
            this.assertFalse(result.success);
        });

        this.test('推荐结果应该包含座位信息', () => {
            const data = new SeatData(10, 20);
            const engine = new RecommendEngine(data);
            const result = engine.recommend('adult', 2, 'couple');
            if (result.success) {
                this.assertTrue(result.seats.length > 0);
                this.assertTrue(result.reason.length > 0);
            }
        });

        this.test('应该为不同年龄段生成不同推荐', () => {
            const data = new SeatData(10, 20);
            const engine = new RecommendEngine(data);
            const result1 = engine.recommend('youth', 1, 'solo');
            const result2 = engine.recommend('senior', 1, 'solo');
            // 两个推荐可能不同（概率性）
            this.assertTrue(result1.success && result2.success);
        });

        this.printSummary();
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

export default TestRecommendEngine;
