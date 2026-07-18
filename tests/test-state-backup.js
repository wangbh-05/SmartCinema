/**
 * Storage v2 安全导入/导出测试。
 */

import { createUser } from '../src/domain/user/User.js';
import { LocalStateRepository, STATE_STORAGE_KEY } from '../src/infrastructure/storage/LocalStateRepository.js';
import {
    IMPORT_ROLLBACK_KEY,
    StateBackupService
} from '../src/infrastructure/storage/StateBackupService.js';
import { createDefaultState } from '../src/infrastructure/storage/StorageValidator.js';

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T00:01:00.000Z';

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

class TestStateBackup {
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
        console.log('\n========== Storage v2 备份测试 ==========\n');

        this.test('默认导出应清除 session 并剔除所有 credential', () => {
            const { repository, service } = this._context();
            repository.update(0, draft => {
                draft.session = { userId: 'admin_001', loginAt: NOW };
            });
            const exported = service.export();
            this.assertTrue(exported.ok);
            this.assertEqual(exported.value.payload.credentialPolicy, 'redacted');
            this.assertEqual(exported.value.payload.state.session, null);
            Object.values(exported.value.payload.state.usersById).forEach(user => {
                this.assertFalse(Object.hasOwn(user, 'credential'));
            });
        });

        this.test('完整导出必须显式包含演示明文凭据且仍清除 session', () => {
            const { service } = this._context();
            const exported = service.export({ includeCredentials: true });
            this.assertTrue(exported.ok);
            this.assertEqual(exported.value.payload.credentialPolicy, 'included-demo-plaintext');
            this.assertEqual(
                exported.value.payload.state.usersById.admin_001.credential.value,
                'admin123'
            );
            this.assertEqual(exported.value.payload.state.session, null);
        });

        this.test('安全备份应从同一安装恢复 credential 并替换业务状态', () => {
            const { storage, clock, repository, service } = this._context();
            const exported = service.export();
            repository.update(0, draft => {
                draft.usersById.admin_001.credential.value = 'current-secret';
                draft.settingsByUser.guest.voiceEnabled = true;
            });
            clock.value = LATER;
            const imported = service.import(exported.value.json);
            this.assertTrue(imported.ok);
            this.assertEqual(imported.value.state.revision, 2);
            this.assertEqual(imported.value.state.updatedAt, LATER);
            this.assertFalse(imported.value.state.settingsByUser.guest.voiceEnabled);
            this.assertEqual(
                imported.value.state.usersById.admin_001.credential.value,
                'current-secret'
            );
            this.assertTrue(storage.getItem(IMPORT_ROLLBACK_KEY) !== null);
        });

        this.test('安全备份包含无法匹配的用户时不得覆盖当前 state', () => {
            const source = this._context();
            source.repository.update(0, draft => {
                const user = createUser({
                    id: 'user-1',
                    username: 'alice',
                    credential: { kind: 'demo-plaintext', value: 'secret1' },
                    name: 'Alice',
                    role: 'member',
                    createdAt: NOW
                });
                draft.usersById[user.id] = user;
            });
            const exported = source.service.export();
            const target = this._context();
            const before = target.storage.getItem(STATE_STORAGE_KEY);
            const imported = target.service.import(exported.value.json);
            this.assertFalse(imported.ok);
            this.assertEqual(imported.error.code, 'BACKUP_CREDENTIALS_REQUIRED');
            this.assertEqual(target.storage.getItem(STATE_STORAGE_KEY), before);
            this.assertEqual(target.storage.getItem(IMPORT_ROLLBACK_KEY), null);
        });

        this.test('完整备份应可移植用户凭据并留下导入前回滚快照', () => {
            const source = this._context();
            source.repository.update(0, draft => {
                const user = createUser({
                    id: 'user-1',
                    username: 'alice',
                    credential: { kind: 'demo-plaintext', value: 'secret1' },
                    name: 'Alice',
                    role: 'member',
                    createdAt: NOW
                });
                draft.usersById[user.id] = user;
                draft.session = { userId: user.id, loginAt: NOW };
            });
            const exported = source.service.export({ includeCredentials: true });
            const target = this._context();
            const imported = target.service.import(exported.value.json);
            this.assertTrue(imported.ok);
            this.assertEqual(imported.value.state.usersById['user-1'].credential.value, 'secret1');
            this.assertEqual(imported.value.state.session, null);
            const rollback = JSON.parse(target.storage.getItem(IMPORT_ROLLBACK_KEY));
            this.assertTrue(Boolean(rollback.state.usersById.admin_001));
            this.assertFalse(Boolean(rollback.state.usersById['user-1']));
        });

        this.test('损坏 JSON、未知顶层字段和不支持版本均不得写入', () => {
            const { storage, service } = this._context();
            const before = storage.getItem(STATE_STORAGE_KEY);
            const badJson = service.import('{bad');
            this.assertEqual(badJson.error.code, 'BACKUP_INVALID');

            const valid = JSON.parse(service.export({ includeCredentials: true }).value.json);
            valid.unknown = true;
            const unknown = service.import(JSON.stringify(valid));
            this.assertEqual(unknown.error.code, 'BACKUP_INVALID');
            delete valid.unknown;
            valid.exportVersion = 999;
            const version = service.import(JSON.stringify(valid));
            this.assertEqual(version.error.code, 'BACKUP_VERSION_UNSUPPORTED');
            this.assertEqual(storage.getItem(STATE_STORAGE_KEY), before);
            this.assertEqual(storage.getItem(IMPORT_ROLLBACK_KEY), null);
        });

        this.test('回滚快照写入失败时不得替换当前 state', () => {
            const { storage, service } = this._context();
            const exported = service.export({ includeCredentials: true });
            const before = storage.getItem(STATE_STORAGE_KEY);
            storage.failKey = IMPORT_ROLLBACK_KEY;
            const imported = service.import(exported.value.json);
            this.assertFalse(imported.ok);
            this.assertEqual(imported.error.code, 'STORAGE_WRITE_FAILED');
            this.assertEqual(storage.getItem(STATE_STORAGE_KEY), before);
        });

        return this.printSummary();
    }

    _context() {
        const storage = new MemoryWebStorage();
        const clock = { value: NOW, now() { return this.value; } };
        const repository = new LocalStateRepository({ storage, clock });
        repository.initialize(createDefaultState(NOW));
        return {
            storage,
            clock,
            repository,
            service: new StateBackupService({ stateRepository: repository, storage, clock })
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

export default TestStateBackup;
