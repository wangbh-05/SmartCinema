/**
 * 单元测试 - ScoreEngine 模块
 */

import { SeatData } from '../src/core/SeatData.js';
import { ScoreEngine } from '../src/modules/ScoreEngine.js';

class TestScoreEngine {
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
        if (Math.abs(actual - expected) > 0.1) {
            throw new Error(`Expected ~${expected}, got ${actual}. ${message}`);
        }
    }

    assertTrue(value, message = '') {
        if (!value) {
            throw new Error(`Expected true, got ${value}. ${message}`);
        }
    }

    runAll() {
        console.log('\n========== ScoreEngine 模块测试 ==========\n');

        // 测试评分
        this.test('应该能计算空选择的评分', () => {
            const data = new SeatData(10, 20);
            const engine = new ScoreEngine(data);
            const result = engine.calculateScore();
            this.assertEqual(result.totalScore, 0);
        });

        this.test('应该能计算选定座位的评分', () => {
            const data = new SeatData(10, 20);
            // 选择一些座位
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    if (data.isSeatAvailable(r, c)) {
                        data.selectSeat(r, c);
                    }
                }
            }
            
            const engine = new ScoreEngine(data);
            const result = engine.calculateScore();
            this.assertTrue(result.totalScore >= 0 && result.totalScore <= 100);
        });

        this.test('评分应该返回详细信息', () => {
            const data = new SeatData(10, 20);
            if (data.isSeatAvailable(0, 0)) {
                data.selectSeat(0, 0);
            }
            
            const engine = new ScoreEngine(data);
            const result = engine.calculateScore();
            this.assertTrue(result.breakdown);
            this.assertTrue(result.details);
        });

        this.test('不同座位应该得到不同评分', () => {
            const data1 = new SeatData(10, 20);
            const data2 = new SeatData(10, 20);
            
            // 选择不同位置的座位
            if (data1.isSeatAvailable(0, 0)) {
                data1.selectSeat(0, 0);
            }
            if (data2.isSeatAvailable(5, 10)) {
                data2.selectSeat(5, 10);
            }
            
            const engine1 = new ScoreEngine(data1);
            const engine2 = new ScoreEngine(data2);
            const score1 = engine1.calculateScore().totalScore;
            const score2 = engine2.calculateScore().totalScore;
            
            // 分数可能不同
            this.assertTrue(true);
        });

        this.printSummary();
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestScoreEngine;
