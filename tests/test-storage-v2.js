/**
 * Storage v2 validator 与 repository 测试。
 */

import { createSeatInventory, sellSeats } from '../src/domain/cinema/SeatInventory.js';
import { createCheckoutIntent } from '../src/domain/order/CheckoutIntent.js';
import { createConfirmedOrder } from '../src/domain/order/Order.js';
import { createUser } from '../src/domain/user/User.js';
import { LocalStateRepository } from '../src/infrastructure/storage/LocalStateRepository.js';
import { SessionCheckoutIntentRepository } from '../src/infrastructure/storage/SessionCheckoutIntentRepository.js';
import {
    createDefaultState,
    validateStateEnvelope
} from '../src/infrastructure/storage/StorageValidator.js';

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T00:01:00.000Z';

class MemoryWebStorage {
    constructor() {
        this.data = new Map();
        this.failWrites = false;
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        if (this.failWrites) throw new Error('quota exceeded');
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
    }
}

class FakeClock {
    constructor(now = NOW) {
        this.value = now;
    }

    now() {
        return this.value;
    }
}

class TestStorageV2 {
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
        console.log('\n========== Storage v2 测试 ==========\n');

        this.test('空白安装应创建可验证的默认 state', () => {
            const state = createDefaultState(NOW);
            const result = validateStateEnvelope(state);
            this.assertTrue(result.ok);
            this.assertEqual(result.value.schemaVersion, 2);
            this.assertEqual(result.value.usersById.admin_001.role, 'admin');
            this.assertTrue(Object.isFrozen(result.value));
        });

        this.test('validator 应拒绝错误订单总价', () => {
            const state = this._stateWithConfirmedOrder();
            state.ordersById['ord-1'].totalPrice = 1;
            const result = validateStateEnvelope(state);
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
        });

        this.test('validator 应拒绝 confirmed 订单缺少库存', () => {
            const state = this._stateWithConfirmedOrder();
            state.inventoriesByShowtime = {};
            const result = validateStateEnvelope(state);
            this.assertFalse(result.ok);
        });

        this.test('repository initialize/read 应返回冻结快照', () => {
            const { repository } = this._repository();
            const initialized = repository.initialize(createDefaultState(NOW));
            this.assertTrue(initialized.ok);
            const read = repository.read();
            this.assertTrue(read.ok);
            this.assertTrue(Object.isFrozen(read.value.settingsByUser.guest));
        });

        this.test('repository update 应一次增加 revision', () => {
            const { repository, clock } = this._repository();
            repository.initialize(createDefaultState(NOW));
            clock.value = LATER;
            const result = repository.update(0, draft => {
                draft.settingsByUser.guest.voiceEnabled = true;
            });
            this.assertTrue(result.ok);
            this.assertEqual(result.value.revision, 1);
            this.assertEqual(result.value.updatedAt, LATER);
            this.assertTrue(result.value.settingsByUser.guest.voiceEnabled);
        });

        this.test('repository 应拒绝旧 revision 覆盖新状态', () => {
            const { repository } = this._repository();
            repository.initialize(createDefaultState(NOW));
            repository.update(0, draft => {
                draft.settingsByUser.guest.voiceEnabled = true;
            });
            const conflict = repository.update(0, draft => {
                draft.settingsByUser.guest.realtimeEnabled = true;
            });
            this.assertFalse(conflict.ok);
            this.assertEqual(conflict.error.code, 'STATE_CONFLICT');
        });

        this.test('repository 写入失败应保留旧 state', () => {
            const { repository, storage } = this._repository();
            repository.initialize(createDefaultState(NOW));
            const before = storage.getItem('smartcinema_state_v2');
            storage.failWrites = true;
            const result = repository.update(0, draft => {
                draft.settingsByUser.guest.voiceEnabled = true;
            });
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_WRITE_FAILED');
            this.assertEqual(storage.getItem('smartcinema_state_v2'), before);
        });

        this.test('CheckoutIntent repository 应保存并消费同一 intent', () => {
            const storage = new MemoryWebStorage();
            const repository = new SessionCheckoutIntentRepository({ storage });
            const intent = createCheckoutIntent({
                id: 'checkout-1',
                userId: 'user-1',
                showtimeId: 'medium:day:3',
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }],
                inventoryRevision: 0,
                createdAt: NOW,
                expiresAt: '2026-07-18T00:15:00.000Z'
            });
            this.assertTrue(repository.save(intent).ok);
            const consumed = repository.consume('checkout-1', 'ord-1');
            this.assertTrue(consumed.ok);
            this.assertEqual(consumed.value.consumedOrderId, 'ord-1');
            this.assertEqual(repository.get().value.state, 'consumed');
        });

        this.test('损坏 CheckoutIntent 应被清除', () => {
            const storage = new MemoryWebStorage();
            storage.setItem('smartcinema_checkout_v2', '{bad json');
            const repository = new SessionCheckoutIntentRepository({ storage });
            const result = repository.get();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'CHECKOUT_NOT_FOUND');
            this.assertEqual(storage.getItem('smartcinema_checkout_v2'), null);
        });

        return this.printSummary();
    }

    _repository() {
        const storage = new MemoryWebStorage();
        const clock = new FakeClock();
        return {
            storage,
            clock,
            repository: new LocalStateRepository({ storage, clock })
        };
    }

    _stateWithConfirmedOrder() {
        const state = JSON.parse(JSON.stringify(createDefaultState(NOW)));
        const user = createUser({
            id: 'user-1',
            username: 'alice',
            credential: { kind: 'demo-plaintext', value: 'secret1' },
            name: 'Alice',
            email: 'alice@example.test',
            role: 'member',
            createdAt: NOW
        });
        state.usersById[user.id] = user;
        const inventory = createSeatInventory({
            showtimeId: 'medium:day:3',
            revision: 0,
            soldSeatKeys: [],
            updatedAt: NOW
        });
        const order = createConfirmedOrder({
            id: 'ord-1',
            idempotencyKey: 'checkout-1',
            userId: user.id,
            showtimeId: inventory.showtimeId,
            seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }],
            createdAt: NOW
        });
        const sold = sellSeats(inventory, ['5-8'], NOW).value;
        state.inventoriesByShowtime[inventory.showtimeId] = sold;
        state.ordersById[order.id] = order;
        return JSON.parse(JSON.stringify(state));
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestStorageV2;
