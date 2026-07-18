import { err, ok } from '../../shared/Result.js';
import { cloneJson } from '../../shared/objects.js';
import { validateStateEnvelope } from './StorageValidator.js';

export const STATE_STORAGE_KEY = 'smartcinema_state_v2';

export class LocalStateRepository {
    constructor({ storage, clock, key = STATE_STORAGE_KEY }) {
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('LocalStateRepository 需要 Storage-like 对象');
        }
        if (!clock || typeof clock.now !== 'function') {
            throw new TypeError('LocalStateRepository 需要 Clock 端口');
        }
        this.storage = storage;
        this.clock = clock;
        this.key = key;
    }

    read() {
        const raw = this.storage.getItem(this.key);
        if (raw === null) return err('MIGRATION_REQUIRED', 'v2 state 尚未初始化');

        try {
            return validateStateEnvelope(JSON.parse(raw));
        } catch (error) {
            return err('STORAGE_CORRUPTED', 'v2 state JSON 无法解析', { reason: error.message });
        }
    }

    initialize(state) {
        if (this.storage.getItem(this.key) !== null) {
            return err('STATE_CONFLICT', 'v2 state 已存在');
        }
        const validated = validateStateEnvelope(state);
        if (!validated.ok) return validated;
        return this._write(validated.value);
    }

    update(expectedRevision, mutate) {
        const current = this.read();
        if (!current.ok) return current;
        if (current.value.revision !== expectedRevision) {
            return err('STATE_CONFLICT', 'state revision 已变化', {
                expectedRevision,
                actualRevision: current.value.revision
            });
        }
        if (typeof mutate !== 'function') return err('VALIDATION_ERROR', 'mutate 必须是函数');

        try {
            const draft = cloneJson(current.value);
            const replacement = mutate(draft);
            const candidate = replacement === undefined ? draft : replacement;
            candidate.schemaVersion = 2;
            candidate.revision = current.value.revision + 1;
            candidate.updatedAt = this.clock.now();
            const validated = validateStateEnvelope(candidate);
            if (!validated.ok) return validated;
            return this._write(validated.value);
        } catch (error) {
            return err('VALIDATION_ERROR', 'state update 失败', { reason: error.message });
        }
    }

    replace(expectedRevision, replacement) {
        const current = this.read();
        if (!current.ok) return current;
        if (current.value.revision !== expectedRevision) {
            return err('STATE_CONFLICT', 'state revision 已变化', {
                expectedRevision,
                actualRevision: current.value.revision
            });
        }
        try {
            const candidate = cloneJson(replacement);
            candidate.schemaVersion = 2;
            candidate.revision = current.value.revision + 1;
            candidate.updatedAt = this.clock.now();
            candidate.session = null;
            const validated = validateStateEnvelope(candidate);
            if (!validated.ok) return validated;
            return this._write(validated.value);
        } catch (error) {
            return err('VALIDATION_ERROR', 'state replace 失败', { reason: error.message });
        }
    }

    _write(state) {
        const json = JSON.stringify(state);
        try {
            this.storage.setItem(this.key, json);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法写入 v2 state', { reason: error.message });
        }

        const readBack = this.read();
        if (!readBack.ok) return readBack;
        if (JSON.stringify(readBack.value) !== json) {
            return err('STORAGE_CORRUPTED', 'v2 state 写入后读回不一致');
        }
        return ok(readBack.value);
    }
}

export default LocalStateRepository;
