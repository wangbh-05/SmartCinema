/**
 * v2 Application 用例测试。
 */

import { createAppState } from '../src/application/AppState.js';
import { loginUser } from '../src/application/auth/Login.js';
import { registerUser } from '../src/application/auth/Register.js';
import { cancelUserOrder } from '../src/application/booking/CancelOrder.js';
import { confirmCheckout } from '../src/application/booking/ConfirmCheckout.js';
import { listVisibleOrders } from '../src/application/booking/ListOrders.js';
import { startCheckout } from '../src/application/booking/StartCheckout.js';
import { applyRemoteHold } from '../src/application/selection/ApplyRemoteHold.js';
import { toggleSeat } from '../src/application/selection/ToggleSeat.js';
import { updateSettings } from '../src/application/settings/UpdateSettings.js';
import { LocalStateRepository } from '../src/infrastructure/storage/LocalStateRepository.js';
import { SessionCheckoutIntentRepository } from '../src/infrastructure/storage/SessionCheckoutIntentRepository.js';
import { createDefaultState } from '../src/infrastructure/storage/StorageValidator.js';

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

class FakeClock {
    constructor() {
        this.value = NOW;
    }

    now() {
        return this.value;
    }
}

class SequenceIdGenerator {
    constructor() {
        this.index = 0;
    }

    next(prefix) {
        this.index++;
        return `${prefix}-${this.index}`;
    }
}

class TestApplicationV2 {
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
        console.log('\n========== v2 Application 用例测试 ==========\n');

        this.test('注册应创建稳定 userId、用户设置并登录', () => {
            const deps = this._deps();
            const result = this._register(deps, 'alice');
            this.assertTrue(result.ok);
            this.assertEqual(result.value.state.session.userId, result.value.user.id);
            this.assertTrue(Boolean(result.value.state.settingsByUser[result.value.user.id]));
            this.assertFalse('credential' in result.value.user);
        });

        this.test('登录失败不得泄露用户名是否存在', () => {
            const deps = this._deps();
            this._register(deps, 'alice');
            const result = loginUser(deps, { username: 'missing', password: 'wrong12' });
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'INVALID_CREDENTIALS');
        });

        this.test('同一 CheckoutIntent 重复确认应返回同一订单', () => {
            const deps = this._deps();
            this._register(deps, 'alice');
            const started = startCheckout(deps, this._checkoutInput(3));
            this.assertTrue(started.ok);
            const first = confirmCheckout(deps);
            const second = confirmCheckout(deps);
            this.assertTrue(first.ok);
            this.assertTrue(second.ok);
            this.assertEqual(first.value.order.id, second.value.order.id);
            this.assertTrue(second.value.duplicate);
            this.assertEqual(Object.keys(second.value.state.ordersById).length, 1);
        });

        this.test('不同日期应维护独立库存', () => {
            const deps = this._deps();
            this._register(deps, 'alice');
            startCheckout(deps, this._checkoutInput(3));
            const confirmed = confirmCheckout(deps);
            this.assertTrue(confirmed.ok);
            const state = deps.stateRepository.read().value;
            this.assertTrue(state.inventoriesByShowtime['medium:day:3'].soldSeatKeys.includes('5-8'));
            this.assertFalse(Boolean(state.inventoriesByShowtime['medium:day:4']));
        });

        this.test('普通用户只能看到自己的订单', () => {
            const deps = this._deps();
            const alice = this._register(deps, 'alice').value.user;
            startCheckout(deps, this._checkoutInput(3));
            confirmCheckout(deps);
            this._register(deps, 'bob');
            startCheckout(deps, {
                showtimeId: 'medium:day:4',
                seats: [{ seatKey: '5-9', row: 5, col: 9, unitPrice: 100 }]
            });
            confirmCheckout(deps);
            loginUser(deps, { username: 'alice', password: 'secret1' });
            const visible = listVisibleOrders(deps);
            this.assertTrue(visible.ok);
            this.assertEqual(visible.value.length, 1);
            this.assertEqual(visible.value[0].userId, alice.id);
        });

        this.test('用户不得取消其他用户订单', () => {
            const deps = this._deps();
            this._register(deps, 'alice');
            startCheckout(deps, this._checkoutInput(3));
            const order = confirmCheckout(deps).value.order;
            this._register(deps, 'bob');
            const result = cancelUserOrder(deps, { orderId: order.id });
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'FORBIDDEN');
        });

        this.test('取消自己的订单应同时释放对应场次库存', () => {
            const deps = this._deps();
            this._register(deps, 'alice');
            startCheckout(deps, this._checkoutInput(3));
            const order = confirmCheckout(deps).value.order;
            const cancelled = cancelUserOrder(deps, { orderId: order.id, reason: '退票' });
            this.assertTrue(cancelled.ok);
            const inventory = cancelled.value.state.inventoriesByShowtime[order.showtimeId];
            this.assertFalse(inventory.soldSeatKeys.includes('5-8'));
            this.assertEqual(cancelled.value.order.status, 'cancelled');
        });

        this.test('RemoteHold 不得写入 LocalSelection', () => {
            const deps = this._deps();
            const persisted = deps.stateRepository.read().value;
            let appState = createAppState(persisted, 'medium:day:3', NOW);
            appState = applyRemoteHold(appState, {
                type: 'hold',
                id: 'hold-1',
                seatKey: '5-8',
                ownerLabel: '观众 A',
                expiresAt: '2026-07-18T00:05:00.000Z'
            }, NOW);
            const selected = toggleSeat(appState, '5-8', NOW);
            this.assertFalse(selected.ok);
            this.assertEqual(appState.selection.seatKeys.length, 0);
            this.assertTrue(appState.remoteHoldsBySeatKey.has('5-8'));
        });

        this.test('设置更新应写入当前用户且保持其他字段', () => {
            const deps = this._deps();
            const user = this._register(deps, 'alice').value.user;
            const result = updateSettings(deps, { voiceEnabled: true, realtimeEnabled: true });
            this.assertTrue(result.ok);
            this.assertTrue(result.value.state.settingsByUser[user.id].voiceEnabled);
            this.assertEqual(result.value.state.settingsByUser[user.id].accentColor, '#58A6FF');
        });

        return this.printSummary();
    }

    _deps() {
        const localStorage = new MemoryWebStorage();
        const sessionStorage = new MemoryWebStorage();
        const clock = new FakeClock();
        const idGenerator = new SequenceIdGenerator();
        const stateRepository = new LocalStateRepository({ storage: localStorage, clock });
        stateRepository.initialize(createDefaultState(NOW));
        return {
            stateRepository,
            checkoutIntentRepository: new SessionCheckoutIntentRepository({ storage: sessionStorage }),
            clock,
            idGenerator
        };
    }

    _register(deps, username) {
        return registerUser(deps, {
            username,
            password: 'secret1',
            name: username.toUpperCase(),
            email: `${username}@example.test`
        });
    }

    _checkoutInput(dayIndex) {
        return {
            showtimeId: `medium:day:${dayIndex}`,
            seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }]
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

export default TestApplicationV2;
