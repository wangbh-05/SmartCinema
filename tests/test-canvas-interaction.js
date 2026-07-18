/**
 * Canvas 纯布局与 Pointer/Keyboard 输入状态机测试。
 */

import { SEAT_STATUS } from '../src/core/SeatData.js';
import { CinemaInputController } from '../src/ui/canvas/CinemaInputController.js';
import { calculateCinemaLayout, hitTestCinemaSeat } from '../src/ui/canvas/CinemaLayout.js';

class FakeSeatData {
    constructor(rows = 2, cols = 3) {
        this.rows = rows;
        this.cols = cols;
        this.seats = Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => ({
                row,
                col,
                status: SEAT_STATUS.AVAILABLE,
                isSelected: false,
                isRemoteHeld: false
            }))
        );
    }

    getSeat(row, col) {
        return this.seats[row]?.[col] || null;
    }

    selectSeat(row, col) {
        const seat = this.getSeat(row, col);
        if (!seat || seat.status !== SEAT_STATUS.AVAILABLE || seat.isRemoteHeld) return false;
        seat.isSelected = true;
        return true;
    }

    deselectSeat(row, col) {
        const seat = this.getSeat(row, col);
        if (!seat) return false;
        seat.isSelected = false;
        return true;
    }

    selectedKeys() {
        return this.seats.flat().filter(seat => seat.isSelected).map(seat => `${seat.row}-${seat.col}`);
    }
}

class FakeCanvas {
    constructor(layout) {
        this.layout = layout;
        this.style = {};
        this.listeners = new Map();
        this.captured = new Set();
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    getBoundingClientRect() {
        return {
            left: 0,
            top: 0,
            width: this.layout.displayWidth,
            height: this.layout.displayHeight
        };
    }

    setPointerCapture(pointerId) {
        this.captured.add(pointerId);
    }

    hasPointerCapture(pointerId) {
        return this.captured.has(pointerId);
    }

    releasePointerCapture(pointerId) {
        this.captured.delete(pointerId);
    }
}

class TestCanvasInteraction {
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
        console.log('\n========== Canvas 交互测试 ==========\n');

        this.test('CinemaLayout 应服从可用尺寸并提供稳定命中测试', () => {
            const layout = this._layout(10, 20, 320);
            this.assertTrue(layout.displayWidth <= 320);
            this.assertEqual(layout.positions.length, 10);
            this.assertEqual(layout.positions[0].length, 20);
            const target = layout.positions[4][8];
            const hit = hitTestCinemaSeat(layout, { x: target.cx, y: target.cy });
            this.assertEqual(hit.row, 4);
            this.assertEqual(hit.col, 8);
        });

        this.test('主 Pointer 点击应切换一个可用座位并只发一次变更', () => {
            const context = this._context();
            const point = this._eventAt(context.layout, 0, 0, 7);
            context.input.handlePointerDown(point);
            context.input.handlePointerUp(point);
            this.assertTrue(context.seatData.getSeat(0, 0).isSelected);
            this.assertEqual(context.changes.value, 1);
            this.assertEqual(context.activations.value, 1);
            this.assertFalse(context.canvas.hasPointerCapture(7));
        });

        this.test('矩形拖选应忽略已售与 remote-held 座位', () => {
            const context = this._context();
            context.seatData.getSeat(0, 1).status = SEAT_STATUS.OCCUPIED;
            context.seatData.getSeat(1, 1).isRemoteHeld = true;
            const start = this._eventAt(context.layout, 0, 0, 8);
            const end = this._eventAt(context.layout, 1, 2, 8);
            context.input.handlePointerDown(start);
            context.input.handlePointerMove(end);
            context.input.handlePointerUp(end);
            this.assertEqual(context.seatData.selectedKeys().length, 4);
            this.assertFalse(context.seatData.getSeat(0, 1).isSelected);
            this.assertFalse(context.seatData.getSeat(1, 1).isSelected);
            this.assertEqual(context.changes.value, 1);
        });

        this.test('pointercancel 与额外触点不得提交选择', () => {
            const context = this._context();
            const primary = this._eventAt(context.layout, 0, 0, 9);
            context.input.handlePointerDown(primary);
            context.input.handlePointerDown({ ...primary, pointerId: 10, isPrimary: false });
            context.input.handlePointerCancel(primary);
            this.assertEqual(context.seatData.selectedKeys().length, 0);
            this.assertEqual(context.input.state.pointerId, null);
            this.assertEqual(context.changes.value, 0);
        });

        this.test('方向键与 Space 应移动焦点并复用同一选择规则', () => {
            const context = this._context();
            const event = key => ({ key, preventDefault() {} });
            context.input.handleKeyDown(event('ArrowRight'));
            context.input.handleKeyDown(event(' '));
            this.assertTrue(context.seatData.getSeat(0, 1).isSelected);
            this.assertEqual(context.input.state.focus.col, 1);
            this.assertEqual(context.changes.value, 1);
        });

        return this.printSummary();
    }

    _layout(rows = 2, cols = 3, availableWidth = 600) {
        return calculateCinemaLayout({
            rows,
            cols,
            availableWidth,
            availableHeight: 500
        });
    }

    _context() {
        const layout = this._layout();
        const seatData = new FakeSeatData();
        const canvas = new FakeCanvas(layout);
        const changes = { value: 0 };
        const activations = { value: 0 };
        const input = new CinemaInputController({
            canvas,
            getLayout: () => layout,
            getSeatData: () => seatData,
            onVisualChange: () => {},
            onSelectionChange: () => { changes.value++; },
            onSeatActivated: () => { activations.value++; }
        });
        return { layout, seatData, canvas, changes, activations, input };
    }

    _eventAt(layout, row, col, pointerId) {
        const position = layout.positions[row][col];
        return {
            pointerId,
            isPrimary: true,
            button: 0,
            clientX: position.cx,
            clientY: position.cy,
            preventDefault() {}
        };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestCanvasInteraction;
