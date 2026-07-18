import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LocalStateRepositoryV3 } from '../src/infrastructure/storage/LocalStateRepositoryV3.js';
import {
    MigrateV2ToV3,
    STATE_STORAGE_KEY_V2,
    V2_BACKUP_BEFORE_V3_KEY
} from '../src/infrastructure/storage/MigrateV2ToV3.js';
import { validateStateEnvelopeV3 } from '../src/infrastructure/storage/StorageValidatorV3.js';

const NOW = '2026-07-18T12:00:00.000Z';
const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/state-v2-commercial-migration.json', import.meta.url));
const V2_FIXTURE_RAW = readFileSync(FIXTURE_PATH, 'utf8');

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

class TestStorageV3 {
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
        console.log('\n========== Storage v3 与 v2→v3 migration 测试 ==========\n');

        this.test('冻结 v2 fixture 应迁移且保留原 key 与迁移前备份', () => {
            const deps = this._deps();
            const result = deps.migration.run();
            this.assertTrue(result.ok);
            this.assertTrue(result.value.migrated);
            this.assertEqual(result.value.state.schemaVersion, 3);
            this.assertEqual(deps.storage.getItem(STATE_STORAGE_KEY_V2), V2_FIXTURE_RAW);
            this.assertEqual(deps.storage.getItem(V2_BACKUP_BEFORE_V3_KEY), V2_FIXTURE_RAW);
            this.assertTrue(Boolean(deps.storage.getItem('smartcinema_state_v3')));
        });

        this.test('迁移应保留用户/订单 ID、金额、座位与 legacy 缺失语义', () => {
            const result = this._deps().migration.run().value.state;
            this.assertTrue(Boolean(result.usersById['user-1']));
            const order = result.ordersById['ord-1'];
            this.assertEqual(order.userId, 'user-1');
            this.assertEqual(order.idempotencyKey, 'checkout-1');
            this.assertEqual(order.pricingQuote.total.amount, 24000);
            this.assertEqual(order.seatSnapshots.length, 2);
            this.assertEqual(order.showtimeSnapshot.startsAt, null);
            this.assertEqual(order.refundPolicySnapshot.refundable, null);
            this.assertEqual(order.legacySource.sourceSchemaVersion, 2);
            const inventory = result.inventoriesByShowtime['legacy-showtime:medium:day:3'];
            this.assertEqual(inventory.soldSeatIds.length, 2);
            this.assertTrue(inventory.soldSeatIds.includes('5-8'));
        });

        this.test('v2→v3 migration 应幂等复用已验证的 v3 state', () => {
            const deps = this._deps();
            const first = deps.migration.run();
            const rawV3 = deps.storage.getItem('smartcinema_state_v3');
            const second = deps.migration.run();
            this.assertTrue(first.ok && second.ok);
            this.assertFalse(second.value.migrated);
            this.assertEqual(deps.storage.getItem('smartcinema_state_v3'), rawV3);
        });

        this.test('损坏 v2 JSON 不得创建 v3 state 或覆盖原数据', () => {
            const deps = this._deps('{bad json');
            const result = deps.migration.run();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
            this.assertEqual(deps.storage.getItem('smartcinema_state_v3'), null);
            this.assertEqual(deps.storage.getItem(STATE_STORAGE_KEY_V2), '{bad json');
        });

        this.test('v2 备份写入失败时不得创建 v3 state', () => {
            const deps = this._deps();
            deps.storage.failKey = V2_BACKUP_BEFORE_V3_KEY;
            const result = deps.migration.run();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_WRITE_FAILED');
            this.assertEqual(deps.storage.getItem('smartcinema_state_v3'), null);
        });

        this.test('v3 validator 应拒绝库存引用不存在的 hold', () => {
            const state = this._plainMigratedState();
            state.inventoriesByShowtime['legacy-showtime:medium:day:3'].holdIdsBySeatId['0-0'] = 'missing-hold';
            const result = validateStateEnvelopeV3(state);
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
        });

        this.test('v3 validator 应拒绝订单价格快照被篡改', () => {
            const state = this._plainMigratedState();
            state.ordersById['ord-1'].pricingQuote.total.amount = 1;
            const result = validateStateEnvelopeV3(state);
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
        });

        this.test('v3 repository 应使用 revision 防止旧状态覆盖', () => {
            const deps = this._deps();
            const migrated = deps.migration.run();
            this.assertTrue(migrated.ok);
            deps.clock.value = '2026-07-18T12:01:00.000Z';
            const updated = deps.repository.update(5, draft => {
                draft.settingsByUser.guest.voiceEnabled = true;
            });
            this.assertTrue(updated.ok);
            this.assertEqual(updated.value.revision, 6);
            this.assertTrue(updated.value.settingsByUser.guest.voiceEnabled);
            const conflict = deps.repository.update(5, draft => {
                draft.settingsByUser.guest.voiceEnabled = false;
            });
            this.assertFalse(conflict.ok);
            this.assertEqual(conflict.error.code, 'STATE_CONFLICT');
        });

        return this.printSummary();
    }

    _deps(rawV2 = V2_FIXTURE_RAW) {
        const storage = new MemoryWebStorage();
        const clock = new FakeClock();
        storage.setItem(STATE_STORAGE_KEY_V2, rawV2);
        const repository = new LocalStateRepositoryV3({ storage, clock });
        const migration = new MigrateV2ToV3({ storage, v3Repository: repository, clock });
        return { storage, clock, repository, migration };
    }

    _plainMigratedState() {
        const state = this._deps().migration.run().value.state;
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

export default TestStorageV3;
