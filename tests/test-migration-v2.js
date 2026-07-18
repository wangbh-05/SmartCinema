/**
 * v1 → v2 可恢复迁移测试。
 */

import {
    MIGRATION_BACKUP_KEY,
    MIGRATION_REPORT_KEY,
    V1ToV2Migration
} from '../src/infrastructure/storage/MigrateV1ToV2.js';

const NOW = '2026-07-18T00:00:00.000Z';

class MemoryWebStorage {
    constructor(initial = {}) {
        this.data = new Map(Object.entries(initial));
        this.failWrites = false;
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        if (this.failWrites) throw new Error('write blocked');
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
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

class TestMigrationV2 {
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
        console.log('\n========== v1 → v2 migration 测试 ==========\n');

        this.test('空白安装应初始化 v2 且 migrated=false', () => {
            const { migration, localStorage } = this._migration();
            const result = migration.run();
            this.assertTrue(result.ok);
            this.assertFalse(result.value.migrated);
            this.assertEqual(result.value.state.schemaVersion, 2);
            this.assertTrue(Boolean(localStorage.getItem(MIGRATION_BACKUP_KEY)));
        });

        this.test('合法用户、session 与 settings 应迁移', () => {
            const user = this._legacyUser();
            const { migration } = this._migration({
                smartcinema_users: JSON.stringify([user]),
                smartcinema_session: JSON.stringify({ username: user.username, loginTime: NOW }),
                smartcinema_settings: JSON.stringify({
                    darkMode: false,
                    voiceEnabled: true,
                    realtimeEnabled: true,
                    accentColor: '#10B981'
                })
            });
            const result = migration.run();
            this.assertTrue(result.ok);
            this.assertEqual(result.value.state.session.userId, user.id);
            this.assertEqual(result.value.state.settingsByUser.guest.theme, 'light');
            this.assertTrue(result.value.state.settingsByUser.guest.voiceEnabled);
            this.assertEqual(result.value.report.migratedUsers, 1);
        });

        this.test('无日期订单与 sold seats 应进入 quarantine', () => {
            const user = this._legacyUser();
            const order = this._legacyOrder({ dayIndex: undefined });
            const { migration, localStorage } = this._migration({
                smartcinema_users: JSON.stringify([user]),
                smartcinema_orders: JSON.stringify([order]),
                smartcinema_sold_seats: JSON.stringify({ medium: ['5-8'] })
            });
            const result = migration.run();
            this.assertTrue(result.ok);
            this.assertEqual(Object.keys(result.value.state.ordersById).length, 0);
            this.assertEqual(result.value.report.quarantinedOrders[0].reason, 'showtime-unresolved');
            this.assertEqual(result.value.report.legacyUnscopedSoldSeatsByHall.medium[0], '5-8');
            this.assertTrue(Boolean(localStorage.getItem(MIGRATION_REPORT_KEY)));
        });

        this.test('可确定 owner/showtime 的订单应迁移并生成库存', () => {
            const user = this._legacyUser();
            const order = this._legacyOrder({ dayIndex: 3 });
            const { migration } = this._migration({
                smartcinema_users: JSON.stringify([user]),
                smartcinema_orders: JSON.stringify([order])
            });
            const result = migration.run();
            this.assertTrue(result.ok);
            this.assertEqual(result.value.report.migratedOrders, 1);
            this.assertEqual(result.value.state.ordersById['legacy-order'].userId, user.id);
            this.assertTrue(
                result.value.state.inventoriesByShowtime['medium:day:3'].soldSeatKeys.includes('5-8')
            );
        });

        this.test('损坏 users 应在备份后停止且不创建 v2 state', () => {
            const { migration, localStorage } = this._migration({
                smartcinema_users: '{bad json'
            });
            const result = migration.run();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_CORRUPTED');
            this.assertTrue(Boolean(localStorage.getItem(MIGRATION_BACKUP_KEY)));
            this.assertEqual(localStorage.getItem('smartcinema_state_v2'), null);
        });

        this.test('备份写入失败不得创建 v2 state', () => {
            const { migration, localStorage } = this._migration({
                smartcinema_users: JSON.stringify([this._legacyUser()])
            });
            localStorage.failWrites = true;
            const result = migration.run();
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'STORAGE_WRITE_FAILED');
            this.assertEqual(localStorage.getItem('smartcinema_state_v2'), null);
        });

        return this.printSummary();
    }

    _migration(local = {}, session = {}) {
        const localStorage = new MemoryWebStorage(local);
        const sessionStorage = new MemoryWebStorage(session);
        return {
            localStorage,
            sessionStorage,
            migration: new V1ToV2Migration({
                localStorage,
                sessionStorage,
                clock: { now: () => NOW },
                idGenerator: new SequenceIdGenerator()
            })
        };
    }

    _legacyUser() {
        return {
            id: 'user-1',
            username: 'alice',
            password: 'secret1',
            name: 'Alice',
            email: 'alice@example.test',
            role: 'member',
            createdAt: NOW
        };
    }

    _legacyOrder(overrides = {}) {
        return {
            id: 'legacy-order',
            timestamp: NOW,
            status: 'confirmed',
            seats: [{ row: 5, col: 8, price: 120 }],
            totalPrice: 120,
            hallType: 'medium',
            userInfo: { name: 'Alice', email: 'alice@example.test' },
            confirmTime: NOW,
            ...overrides
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

export default TestMigrationV2;
