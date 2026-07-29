import { err, ok } from '../../shared/Result.js';
import { cloneJson, isPlainObject } from '../../shared/objects.js';
import { STATE_SCHEMA_VERSION, validateState } from './StateValidator.js';

export const BACKUP_FORMAT = 'smartcinema-backup';
export const BACKUP_VERSION = STATE_SCHEMA_VERSION;
export const IMPORT_ROLLBACK_KEY = 'smartcinema_import_rollback';

const PAYLOAD_KEYS = new Set([
    'exportFormat',
    'exportVersion',
    'exportedAt',
    'credentialPolicy',
    'restorable',
    'state'
]);

function hasOnlyKnownKeys(value) {
    return Object.keys(value).every(key => PAYLOAD_KEYS.has(key));
}

function redactState(state) {
    const redacted = cloneJson(state);
    redacted.session = null;
    Object.values(redacted.usersById).forEach(user => {
        user.credential = null;
    });
    return redacted;
}

export class StateBackupService {
    constructor({
        stateRepository,
        storage,
        clock,
        rollbackKey = IMPORT_ROLLBACK_KEY
    }) {
        if (!stateRepository) throw new TypeError('StateBackupService 需要 stateRepository');
        if (!storage || typeof storage.setItem !== 'function') {
            throw new TypeError('StateBackupService 需要 Storage-like 对象');
        }
        if (!clock || typeof clock.now !== 'function') {
            throw new TypeError('StateBackupService 需要 Clock 端口');
        }
        this.stateRepository = stateRepository;
        this.storage = storage;
        this.clock = clock;
        this.rollbackKey = rollbackKey;
    }

    export({ includeCredentials = false } = {}) {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const state = includeCredentials ? cloneJson(current.value) : redactState(current.value);
        state.session = null;
        const payload = {
            exportFormat: BACKUP_FORMAT,
            exportVersion: BACKUP_VERSION,
            exportedAt: this.clock.now(),
            credentialPolicy: includeCredentials ? 'included-demo-plaintext' : 'redacted',
            restorable: includeCredentials,
            state
        };
        return ok({
            payload: Object.freeze(payload),
            json: JSON.stringify(payload, null, 2),
            restorable: includeCredentials
        });
    }

    import(jsonString) {
        let payload;
        try {
            payload = JSON.parse(jsonString);
        } catch (error) {
            return err('BACKUP_INVALID', '备份 JSON 无法解析', { reason: error.message });
        }
        if (!isPlainObject(payload) || !hasOnlyKnownKeys(payload)) {
            return err('BACKUP_INVALID', '备份包含未知顶层字段');
        }
        if (payload.exportFormat !== BACKUP_FORMAT || payload.exportVersion !== BACKUP_VERSION) {
            return err('BACKUP_UNSUPPORTED', '备份版本与当前状态格式不兼容');
        }
        if (payload.restorable !== true || payload.credentialPolicy !== 'included-demo-plaintext') {
            return err('BACKUP_NOT_RESTORABLE', '脱敏诊断快照不能用于恢复');
        }

        const importedState = cloneJson(payload.state);
        if (!isPlainObject(importedState)) return err('BACKUP_INVALID', '备份缺少 state');
        importedState.session = null;
        const validated = validateState(importedState);
        if (!validated.ok) return err('BACKUP_INVALID', validated.error.message, validated.error.details);
        if (!Object.values(validated.value.usersById).some(user => user.role === 'admin')) {
            return err('BACKUP_INVALID', '恢复备份必须保留至少一个管理员');
        }

        const current = this.stateRepository.read();
        if (!current.ok) return current;
        try {
            this.storage.setItem(this.rollbackKey, JSON.stringify({
                savedAt: this.clock.now(),
                state: current.value
            }));
        } catch (error) {
            return err('BACKUP_WRITE_FAILED', '无法写入导入前回滚快照', { reason: error.message });
        }

        const replaced = this.stateRepository.replace(current.value.revision, validated.value);
        if (!replaced.ok) return replaced;
        return ok({
            state: replaced.value,
            rollbackKey: this.rollbackKey,
            sourceRevision: validated.value.revision
        });
    }
}

export default StateBackupService;
