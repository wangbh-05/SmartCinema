import { createShowtimeInventory } from '../src/domain/booking/ShowtimeInventory.js';
import {
    LocalStateRepository,
    STATE_STORAGE_KEY
} from '../src/infrastructure/storage/LocalStateRepository.js';
import { StateInitializer } from '../src/infrastructure/storage/StateInitializer.js';
import { createDefaultState } from '../src/infrastructure/storage/InitialState.js';
import { validateState } from '../src/infrastructure/storage/StateValidator.js';

const NOW = '2026-07-18T12:00:00.000Z';

class MemoryWebStorage {
    constructor() {
        this.data = new Map();
        this.failKey = null;
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        if (key === this.failKey) throw new Error('quota exceeded');
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
    }
}

class FakeClock {
    constructor(value = NOW) {
        this.value = value;
    }

    now() {
        return this.value;
    }
}

export default class TestStateStorage {
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
        console.log('\n========== State Storage 测试 ==========\n');

        this.test('空白存储应初始化唯一当前状态和默认管理员', () => {
            const deps = this._deps();
            const result = deps.initializer.run();
            this.assertTrue(result.ok);
            this.assertTrue(result.value.initialized);
            this.assertEqual(result.value.state.schemaVersion, 4);
            this.assertEqual(result.value.state.usersById.admin_001.username, 'admin');
            this.assertTrue(Boolean(deps.storage.getItem(STATE_STORAGE_KEY)));
            this.assertEqual(deps.storage.data.size, 1);
        });

        this.test('重复初始化应原样复用已验证状态', () => {
            const deps = this._deps();
            const first = deps.initializer.run();
            const raw = deps.storage.getItem(STATE_STORAGE_KEY);
            const second = deps.initializer.run();
            this.assertTrue(first.ok && second.ok);
            this.assertFalse(second.value.initialized);
            this.assertEqual(deps.storage.getItem(STATE_STORAGE_KEY), raw);
            this.assertEqual(second.value.state.revision, 0);
        });

        this.test('并发页面抢先初始化时应复用已写入状态', () => {
            const deps = this._deps();
            const initialize = deps.repository.initialize.bind(deps.repository);
            deps.repository.initialize = state => {
                const winner = initialize(state);
                this.assertTrue(winner.ok);
                return initialize(state);
            };
            const result = deps.initializer.run();
            this.assertTrue(result.ok);
            this.assertFalse(result.value.initialized);
            this.assertEqual(result.value.state.usersById.admin_001.username, 'admin');
            this.assertEqual(deps.storage.data.size, 1);
        });

        this.test('损坏 JSON 不得被初始化流程覆盖', () => {
            const deps = this._deps();
            deps.storage.setItem(STATE_STORAGE_KEY, '{bad json');
            const result = deps.initializer.run();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
            this.assertEqual(deps.storage.getItem(STATE_STORAGE_KEY), '{bad json');
        });

        this.test('写入失败不得报告初始化成功', () => {
            const deps = this._deps();
            deps.storage.failKey = STATE_STORAGE_KEY;
            const result = deps.initializer.run();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_WRITE_FAILED');
            this.assertEqual(deps.storage.getItem(STATE_STORAGE_KEY), null);
        });

        this.test('validator 应拒绝库存引用不存在的 hold', () => {
            const state = this._plainState();
            state.inventoriesByShowtime['showtime-1'] = createShowtimeInventory({
                showtimeId: 'showtime-1',
                holdIdsBySeatId: { A1: 'missing-hold' },
                updatedAt: NOW
            });
            const result = validateState(state);
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
        });

        this.test('validator 应只保留当前生效的辅助偏好字段', () => {
            const state = this._plainState();
            state.settingsByUser.guest = {
                ...state.settingsByUser.guest,
                theme: 'dark',
                voiceEnabled: true
            };
            const result = validateState(state);
            this.assertTrue(result.ok);
            this.assertEqual(Object.keys(result.value.settingsByUser.guest).sort().join(','), [
                'accessibilityMode',
                'colorblindMode',
                'highContrastMode',
                'reducedMotion'
            ].sort().join(','));
        });

        this.test('repository 应使用 revision 防止旧状态覆盖', () => {
            const deps = this._deps();
            this.assertTrue(deps.initializer.run().ok);
            deps.clock.value = '2026-07-18T12:01:00.000Z';
            const updated = deps.repository.update(0, draft => {
                draft.settingsByUser.guest.highContrastMode = true;
            });
            this.assertTrue(updated.ok);
            this.assertEqual(updated.value.revision, 1);
            this.assertTrue(updated.value.settingsByUser.guest.highContrastMode);
            const conflict = deps.repository.update(0, draft => {
                draft.settingsByUser.guest.highContrastMode = false;
            });
            this.assertFalse(conflict.ok);
            this.assertEqual(conflict.error.code, 'STATE_CONFLICT');
        });

        return this.printSummary();
    }

    _deps() {
        const storage = new MemoryWebStorage();
        const clock = new FakeClock();
        const repository = new LocalStateRepository({ storage, clock });
        const initializer = new StateInitializer({ stateRepository: repository, clock });
        return { storage, clock, repository, initializer };
    }

    _plainState() {
        return JSON.parse(JSON.stringify(createDefaultState(NOW)));
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}
