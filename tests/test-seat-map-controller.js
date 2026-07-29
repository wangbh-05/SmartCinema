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

    assertNear(actual, expected, tolerance = 0.0001) {
        if (Math.abs(actual - expected) > tolerance) {
            throw new Error(`Expected ${expected} ± ${tolerance}, got ${actual}`);
        }
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

        this.test('超过最大缩放时应使用有效 scale 保持双指锚点', () => {
            const controller = Object.create(CommercialSeatMapController.prototype);
            controller.viewport = { clientWidth: 400, clientHeight: 300 };
            controller.layout = { width: 200, height: 100 };
            controller.view = { minScale: 1, maxScale: 2 };
            controller.pinch = { anchorX: 100, anchorY: 50 };

            const next = controller._pinchViewAt({ x: 200, y: 150 }, 3);

            this.assertNear(next.scale, 2.2);
            this.assertNear(next.panX + controller.pinch.anchorX * next.scale, 200);
            this.assertNear(next.panY + controller.pinch.anchorY * next.scale, 150);
        });

        this.test('放大后的状态提示应明确需要双指拖动', () => {
            const controller = Object.create(CommercialSeatMapController.prototype);
            controller.view = { mobile: true, scale: 1.5, minScale: 1, maxScale: 2 };
            controller.zoomStatus = { textContent: '' };
            controller.zoomOutButton = {};
            controller.zoomInButton = {};
            controller.zoomFitButton = {};
            controller.gestureHint = { setAttribute() {} };

            controller._updateZoomControls();

            this.assertEqual(controller.zoomStatus.textContent, '150% · 双指拖动查看');
        });

        return {
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed
        };
    }
}
