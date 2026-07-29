import { err, ok } from '../../shared/Result.js';
import { cloneJson } from '../../shared/objects.js';
import { STATE_SCHEMA_VERSION, validateState } from './StateValidator.js';

export const STATE_STORAGE_KEY = 'smartcinema_state';

export class LocalStateRepository {
    constructor({ storage, clock, key = STATE_STORAGE_KEY }) {
        if (!storage ||
            typeof storage.getItem !== 'function' ||
            typeof storage.setItem !== 'function' ||
            typeof storage.removeItem !== 'function') {
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
        if (raw === null) return err('STATE_NOT_INITIALIZED', 'state 尚未初始化');
        try {
            return validateState(JSON.parse(raw));
        } catch (error) {
            return err('STORAGE_CORRUPTED', 'state JSON 无法解析', { reason: error.message });
        }
    }

    initialize(state) {
        if (this.storage.getItem(this.key) !== null) return err('STATE_CONFLICT', 'state 已存在');
        const validated = validateState(state);
        if (!validated.ok) return validated;
        return this._write(validated.value);
    }

    clear() {
        try {
            this.storage.removeItem(this.key);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法清理旧 state', { reason: error.message });
        }
        if (this.storage.getItem(this.key) !== null) {
            return err('STORAGE_WRITE_FAILED', '旧 state 清理后仍然存在');
        }
        return ok(null);
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
            candidate.schemaVersion = STATE_SCHEMA_VERSION;
            candidate.revision = current.value.revision + 1;
            candidate.updatedAt = this.clock.now();
            const validated = validateState(candidate);
            if (!validated.ok) return validated;
            return this._write(validated.value);
        } catch (error) {
            return err('VALIDATION_ERROR', 'state update 失败', { reason: error.message });
        }
    }

    replace(expectedRevision, state) {
        const current = this.read();
        if (!current.ok) return current;
        if (current.value.revision !== expectedRevision) {
            return err('STATE_CONFLICT', 'state revision 已变化', {
                expectedRevision,
                actualRevision: current.value.revision
            });
        }
        try {
            const candidate = cloneJson(state);
            candidate.schemaVersion = STATE_SCHEMA_VERSION;
            candidate.revision = current.value.revision + 1;
            candidate.updatedAt = this.clock.now();
            const validated = validateState(candidate);
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
            return err('STORAGE_WRITE_FAILED', '无法写入 state', { reason: error.message });
        }
        const readBack = this.read();
        if (!readBack.ok) return readBack;
        if (JSON.stringify(readBack.value) !== json) {
            return err('STORAGE_CORRUPTED', 'state 写入后读回不一致');
        }
        return ok(readBack.value);
    }
}

export default LocalStateRepository;
