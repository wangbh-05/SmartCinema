/**
 * 推荐与评分纯用例及 AppState 派生状态测试。
 */

import { createBrowserAppController } from '../src/bootstrap.js';
import { createSeatLayoutSnapshot } from '../src/application/cinema/SeatLayoutSnapshot.js';
import { recommendSeats } from '../src/application/recommendation/RecommendSeats.js';
import { combineScores, scoreSelection } from '../src/application/scoring/ScoreSelection.js';

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

class TestDerivedState {
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

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    assertFalse(value, message = '') {
        if (value) throw new Error(`Expected false. ${message}`);
    }

    runAll() {
        console.log('\n========== 推荐与评分派生状态测试 ==========\n');

        this.test('座位快照应冻结并拒绝尺寸不匹配', () => {
            const layout = this._layout();
            this.assertTrue(Object.isFrozen(layout));
            this.assertTrue(Object.isFrozen(layout.seats[0][0]));
            let threw = false;
            try {
                createSeatLayoutSnapshot({ rows: 2, cols: 2, seats: [[]] });
            } catch (error) {
                threw = true;
            }
            this.assertTrue(threw);
        });

        this.test('推荐纯用例应执行年龄硬约束并返回稳定 SeatKey', () => {
            const result = recommendSeats(this._layout(), {
                ageGroup: 'youth,senior',
                groupSize: 2,
                movieType: 'couple'
            });
            this.assertTrue(result.ok);
            this.assertEqual(result.value.seats.length, 2);
            result.value.seats.forEach(seat => {
                this.assertTrue(seat.row >= 3 && seat.row <= 6);
                this.assertEqual(seat.seatKey, `${seat.row}-${seat.col}`);
            });
        });

        this.test('评分纯用例应由只读快照计算且不依赖 SeatData', () => {
            const score = scoreSelection(this._layout(['5-8', '5-9']));
            this.assertTrue(score.totalScore > 0 && score.totalScore <= 100);
            this.assertEqual(score.details.length, 4);
            this.assertTrue(Object.isFrozen(score));
        });

        this.test('用户评分必须逐项校验并生成结构化综合评分', () => {
            const systemScore = scoreSelection(this._layout(['5-8']));
            const combined = combineScores(systemScore, {
                vision: 8,
                distance: 7,
                comfort: 9,
                price: 6
            });
            this.assertTrue(combined.ok);
            this.assertTrue(combined.value.combinedScore.totalScore > 0);
            const invalid = combineScores(systemScore, {
                vision: 11,
                distance: 7,
                comfort: 9,
                price: 6
            });
            this.assertFalse(invalid.ok);
            this.assertEqual(invalid.error.code, 'VALIDATION_ERROR');
        });

        this.test('AppController 应持有推荐和全部评分派生状态', () => {
            const controller = this._controller();
            controller.initialize();
            const recommended = controller.recommendSeats(this._layout(), {
                ageGroup: 'adult',
                groupSize: 1,
                movieType: 'solo'
            });
            this.assertTrue(recommended.ok);
            this.assertTrue(Boolean(controller.getState().recommendation));

            controller.replaceSelection(['5-8']);
            const scored = controller.calculateSystemScore(this._layout(['5-8']));
            this.assertTrue(scored.ok);
            const combined = controller.submitManualScore({
                vision: 8,
                distance: 8,
                comfort: 8,
                price: 8
            });
            this.assertTrue(combined.ok);
            this.assertTrue(Boolean(controller.getState().systemScore));
            this.assertTrue(Boolean(controller.getState().manualScore));
            this.assertTrue(Boolean(controller.getState().combinedScore));

            const before = controller.getState();
            controller.replaceSelection(['5-8']);
            this.assertEqual(controller.getState(), before, '相同选择命令必须幂等');
            this.assertTrue(Boolean(controller.getState().combinedScore));
        });

        this.test('选择与库存变化应按契约失效派生状态', () => {
            const controller = this._controller();
            controller.initialize();
            controller.replaceSelection(['5-8']);
            controller.calculateSystemScore(this._layout(['5-8']));
            controller.submitManualScore({ vision: 8, distance: 8, comfort: 8, price: 8 });
            const manualScore = controller.getState().manualScore;

            controller.replaceSelection(['5-9']);
            this.assertEqual(controller.getState().systemScore, null);
            this.assertEqual(controller.getState().combinedScore, null);
            this.assertEqual(controller.getState().manualScore, manualScore);

            controller.calculateSystemScore(this._layout(['5-9']));
            controller.applyRemotePurchase({ showtimeId: 'medium:day:3', seatKey: '1-1' });
            this.assertEqual(controller.getState().systemScore, null);
        });

        this.test('评分快照与当前选择不一致时应返回冲突', () => {
            const controller = this._controller();
            controller.initialize();
            controller.replaceSelection(['5-8']);
            const result = controller.calculateSystemScore(this._layout());
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STATE_CONFLICT');
        });

        return this.printSummary();
    }

    _layout(selectedKeys = [], occupiedKeys = []) {
        const selected = new Set(selectedKeys);
        const occupied = new Set(occupiedKeys);
        const rows = 10;
        const cols = 20;
        return createSeatLayoutSnapshot({
            rows,
            cols,
            seats: Array.from({ length: rows }, (_, row) =>
                Array.from({ length: cols }, (_, col) => {
                    const seatKey = `${row}-${col}`;
                    return {
                        row,
                        col,
                        status: occupied.has(seatKey) ? 'occupied' : 'available',
                        price: row >= 3 && row <= 6 ? 120 : 60,
                        isSelected: selected.has(seatKey),
                        isRemoteHeld: false
                    };
                })
            )
        });
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

export default TestDerivedState;
