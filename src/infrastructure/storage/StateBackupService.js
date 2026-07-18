import { err, ok } from '../../shared/Result.js';
import { cloneJson, isPlainObject } from '../../shared/objects.js';
import { validateStateEnvelope } from './StorageValidator.js';

export const BACKUP_FORMAT = 'smartcinema-backup';
export const BACKUP_VERSION = 2;
export const IMPORT_ROLLBACK_KEY = 'smartcinema_import_backup_v2';

const PAYLOAD_KEYS = new Set([
    'exportFormat',
    'exportVersion',
    'exportedAt',
    'credentialPolicy',
    'state',
    'migrationReport'
]);

function hasOnlyKnownPayloadKeys(payload) {
    return Object.keys(payload).every(key => PAYLOAD_KEYS.has(key));
}

export class StateBackupService {
    constructor({ stateRepository, storage, clock, migrationReportKey = 'smartcinema_migration_report_v2' }) {
        if (!stateRepository) throw new TypeError('StateBackupService 需要 StateRepository');
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('StateBackupService 需要 Storage-like 对象');
        }
        if (!clock || typeof clock.now !== 'function') throw new TypeError('StateBackupService 需要 Clock');
        this.stateRepository = stateRepository;
        this.storage = storage;
        this.clock = clock;
        this.migrationReportKey = migrationReportKey;
    }

    export({ includeCredentials = false } = {}) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const state = cloneJson(current.value);
        state.session = null;
        if (!includeCredentials) {
            Object.values(state.usersById).forEach(user => delete user.credential);
        }

        const payload = {
            exportFormat: BACKUP_FORMAT,
            exportVersion: BACKUP_VERSION,
            exportedAt: this.clock.now(),
            credentialPolicy: includeCredentials ? 'included-demo-plaintext' : 'redacted',
            state,
            migrationReport: this._readMigrationReport()
        };
        return ok({
            payload,
            json: JSON.stringify(payload, null, 2),
            includesCredentials: includeCredentials
        });
    }

    import(jsonString) {
        const parsed = this._parsePayload(jsonString);
        if (!parsed.ok) return parsed;
        const current = this.stateRepository.read();
        if (!current.ok) return current;

        const candidate = cloneJson(parsed.value.state);
        candidate.session = null;
        const hydrated = this._hydrateCredentials(candidate, current.value, parsed.value.credentialPolicy);
        if (!hydrated.ok) return hydrated;
        const validated = validateStateEnvelope(candidate);
        if (!validated.ok) {
            return err('BACKUP_INVALID', '备份 state 校验失败', { reason: validated.error.message });
        }

        const rollback = {
            backupVersion: 2,
            createdAt: this.clock.now(),
            reason: 'before-import',
            state: current.value
        };
        try {
            this.storage.setItem(IMPORT_ROLLBACK_KEY, JSON.stringify(rollback));
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法创建导入前回滚备份', { reason: error.message });
        }

        const replaced = this.stateRepository.replace(current.value.revision, validated.value);
        if (!replaced.ok) return replaced;
        return ok({ state: replaced.value, importedAt: this.clock.now() });
    }

    _parsePayload(jsonString) {
        if (typeof jsonString !== 'string') return err('BACKUP_INVALID', '备份必须是 JSON 字符串');
        try {
            const payload = JSON.parse(jsonString);
            if (!isPlainObject(payload) || !hasOnlyKnownPayloadKeys(payload)) {
                return err('BACKUP_INVALID', '备份顶层结构或字段无效');
            }
            if (payload.exportFormat !== BACKUP_FORMAT || payload.exportVersion !== BACKUP_VERSION) {
                return err('BACKUP_VERSION_UNSUPPORTED', '仅支持 SmartCinema v2 备份');
            }
            if (typeof payload.exportedAt !== 'string' || Number.isNaN(Date.parse(payload.exportedAt))) {
                return err('BACKUP_INVALID', 'exportedAt 无效');
            }
            if (!['redacted', 'included-demo-plaintext'].includes(payload.credentialPolicy)) {
                return err('BACKUP_INVALID', 'credentialPolicy 无效');
            }
            if (!isPlainObject(payload.state)) return err('BACKUP_INVALID', '备份 state 必须是对象');
            return ok(payload);
        } catch (error) {
            return err('BACKUP_INVALID', '备份 JSON 无法解析', { reason: error.message });
        }
    }

    _hydrateCredentials(candidate, current, policy) {
        if (!isPlainObject(candidate.usersById)) return err('BACKUP_INVALID', 'usersById 无效');
        if (policy === 'included-demo-plaintext') return ok(candidate);

        for (const user of Object.values(candidate.usersById)) {
            const currentUser = current.usersById[user.id];
            if (!currentUser || currentUser.username !== user.username) {
                return err(
                    'BACKUP_CREDENTIALS_REQUIRED',
                    '安全备份包含当前安装无法匹配的用户，请使用包含演示凭据的完整备份'
                );
            }
            user.credential = cloneJson(currentUser.credential);
        }
        return ok(candidate);
    }

    _readMigrationReport() {
        try {
            const raw = this.storage.getItem(this.migrationReportKey);
            return raw === null ? null : JSON.parse(raw);
        } catch (error) {
            return null;
        }
    }
}

export default StateBackupService;
