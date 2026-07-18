/**
 * v2 纯领域契约测试。
 */

import { ValidationError } from '../src/shared/ValidationError.js';
import { createShowtime, createShowtimeId, parseShowtimeId } from '../src/domain/cinema/Showtime.js';
import { createSeatKey, parseSeatKey } from '../src/domain/cinema/Seat.js';
import {
    areSeatsAvailable,
    createSeatInventory,
    releaseSeats,
    sellSeats
} from '../src/domain/cinema/SeatInventory.js';
import { cancelOrder, createConfirmedOrder } from '../src/domain/order/Order.js';
import { createUser, sanitizeUser } from '../src/domain/user/User.js';

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T00:01:00.000Z';

class TestDomainContracts {
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

    assertThrows(fn, ErrorType = Error) {
        try {
            fn();
        } catch (error) {
            if (error instanceof ErrorType) return;
            throw error;
        }
        throw new Error(`Expected ${ErrorType.name} to be thrown`);
    }

    runAll() {
        console.log('\n========== v2 领域契约测试 ==========\n');

        this.test('ShowtimeId 应保留合法的周一 dayIndex=0', () => {
            const id = createShowtimeId('medium', 0);
            const showtime = parseShowtimeId(id);
            this.assertEqual(id, 'medium:day:0');
            this.assertEqual(showtime.dayIndex, 0);
            this.assertEqual(showtime.hall.cols, 20);
        });

        this.test('ShowtimeId 应拒绝无效影厅和日期', () => {
            this.assertThrows(() => createShowtimeId('vip', 3), ValidationError);
            this.assertThrows(() => createShowtimeId('small', 7), ValidationError);
            this.assertThrows(() => parseShowtimeId('small:3'), ValidationError);
        });

        this.test('SeatKey 应结合影厅边界校验', () => {
            this.assertEqual(createSeatKey(9, 9, 'small'), '9-9');
            this.assertEqual(parseSeatKey('0-0', 'small').row, 0);
            this.assertThrows(() => parseSeatKey('9-10', 'small'), ValidationError);
        });

        this.test('库存售出应原子增加 revision 且不修改原对象', () => {
            const inventory = this._inventory();
            const result = sellSeats(inventory, ['5-8', '5-9'], LATER);
            this.assertTrue(result.ok);
            this.assertEqual(inventory.soldSeatKeys.length, 0);
            this.assertEqual(result.value.soldSeatKeys.length, 2);
            this.assertEqual(result.value.revision, 1);
        });

        this.test('库存中任一座位已售时整个售出操作失败', () => {
            const inventory = createSeatInventory({
                showtimeId: 'medium:day:3',
                revision: 1,
                soldSeatKeys: ['5-8'],
                updatedAt: NOW
            });
            const result = sellSeats(inventory, ['5-8', '5-9'], LATER);
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'SEAT_UNAVAILABLE');
            this.assertFalse(inventory.soldSeatKeys.includes('5-9'));
        });

        this.test('库存退票应只释放订单中的已售座位', () => {
            const sold = sellSeats(this._inventory(), ['5-8', '5-9'], LATER).value;
            const released = releaseSeats(sold, ['5-8'], '2026-07-18T00:02:00.000Z');
            this.assertTrue(released.ok);
            this.assertFalse(released.value.soldSeatKeys.includes('5-8'));
            this.assertTrue(released.value.soldSeatKeys.includes('5-9'));
        });

        this.test('订单应从座位单价重新计算总价', () => {
            const order = this._order();
            this.assertEqual(order.totalPrice, 220);
            this.assertEqual(order.showtimeId, 'medium:day:3');
            this.assertEqual(order.status, 'confirmed');
        });

        this.test('已经取消的订单不得重复取消', () => {
            const first = cancelOrder(this._order(), {
                cancelledAt: '2026-07-18T00:03:00.000Z',
                reason: '用户退票'
            });
            const second = cancelOrder(first.value, {
                cancelledAt: '2026-07-18T00:04:00.000Z',
                reason: '重复'
            });
            this.assertFalse(second.ok);
            this.assertEqual(second.error.code, 'ORDER_ALREADY_CANCELLED');
        });

        this.test('sanitizeUser 不得暴露 credential', () => {
            const user = createUser({
                id: 'user-1',
                username: 'alice',
                credential: { kind: 'demo-plaintext', value: 'secret' },
                name: 'Alice',
                email: 'alice@example.test',
                role: 'member',
                createdAt: NOW
            });
            const safe = sanitizeUser(user);
            this.assertFalse('credential' in safe);
            this.assertEqual(safe.id, 'user-1');
        });

        return this.printSummary();
    }

    _inventory() {
        return createSeatInventory({
            showtimeId: createShowtime('medium', 3).id,
            revision: 0,
            soldSeatKeys: [],
            updatedAt: NOW
        });
    }

    _order() {
        return createConfirmedOrder({
            id: 'ord-1',
            idempotencyKey: 'checkout-1',
            userId: 'user-1',
            showtimeId: 'medium:day:3',
            seats: [
                { seatKey: '5-8', row: 5, col: 8, unitPrice: 120 },
                { seatKey: '5-9', row: 5, col: 9, unitPrice: 100 }
            ],
            createdAt: NOW
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

export default TestDomainContracts;
