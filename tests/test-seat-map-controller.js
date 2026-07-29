import { CommercialSeatMapController } from '../src/ui/controllers/CommercialSeatMapController.js';

export default class TestSeatMapController {
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

    runAll() {
        console.log('\n========== Seat Map Controller 测试 ==========\n');

        this.test('无障碍座位应允许触摸点按但禁止滑动连选', () => {
            const controller = Object.create(CommercialSeatMapController.prototype);
            controller._isUnavailable = () => false;
            for (const kind of ['wheelchair', 'companion']) {
                const seat = { id: `seat-${kind}`, kind };
                this.assertEqual(controller._canTapTouchSeat(seat), true);
                this.assertEqual(controller._canStartTouchSelect(seat), false);
                this.assertEqual(controller._canAddTouchSelectedSeat(seat), false);
            }
        });

        this.test('不可用座位不应允许触摸点按', () => {
            const controller = Object.create(CommercialSeatMapController.prototype);
            controller._isUnavailable = () => true;
            this.assertEqual(controller._canTapTouchSeat({ id: 'sold-seat', kind: 'wheelchair' }), false);
        });

        this.test('仅点按手势结束时应交给单座切换规则', () => {
            const controller = Object.create(CommercialSeatMapController.prototype);
            let toggledSeatId = null;
            let selectedAsBlock = false;
            controller.touchSelect = {
                pointerId: 1,
                tapOnly: true,
                active: false,
                startSeatId: 'wheelchair-1',
                seatIds: new Set(['wheelchair-1'])
            };
            controller._suppressSyntheticClick = () => {};
            controller._isUnavailable = () => false;
            controller.onToggleSeat = seatId => {
                toggledSeatId = seatId;
            };
            controller.onSelectSeats = () => {
                selectedAsBlock = true;
            };

            this.assertEqual(controller._finishTouchSelect(), true);
            this.assertEqual(toggledSeatId, 'wheelchair-1');
            this.assertEqual(selectedAsBlock, false);
        });

        return {
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed
        };
    }
}
