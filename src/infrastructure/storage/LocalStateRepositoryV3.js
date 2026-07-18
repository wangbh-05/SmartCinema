import { err, ok } from '../../shared/Result.js';
import { cloneJson } from '../../shared/objects.js';
import { validateStateEnvelopeV3 } from './StorageValidatorV3.js';

export const STATE_STORAGE_KEY_V3 = 'smartcinema_state_v3';

export class LocalStateRepositoryV3 {
    constructor({ storage, clock, key = STATE_STORAGE_KEY_V3 }) {
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('LocalStateRepositoryV3 需要 Storage-like 对象');
        }
        if (!clock || typeof clock.now !== 'function') {
            throw new TypeError('LocalStateRepositoryV3 需要 Clock 端口');
        }
        this.storage = storage;
        this.clock = clock;
        this.key = key;
    }

    read() {
        const raw = this.storage.getItem(this.key);
        if (raw === null) return err('MIGRATION_REQUIRED', 'v3 state 尚未初始化');
        try {
            return validateStateEnvelopeV3(JSON.parse(raw));
        } catch (error) {
            return err('STORAGE_CORRUPTED', 'v3 state JSON 无法解析', { reason: error.message });
        }
    }

    initialize(state) {
        if (this.storage.getItem(this.key) !== null) return err('STATE_CONFLICT', 'v3 state 已存在');
        const validated = validateStateEnvelopeV3(state);
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
            candidate.schemaVersion = 3;
            candidate.revision = current.value.revision + 1;
            candidate.updatedAt = this.clock.now();
            const validated = validateStateEnvelopeV3(candidate);
            if (!validated.ok) return validated;
            return this._write(validated.value);
        } catch (error) {
            return err('VALIDATION_ERROR', 'state v3 update 失败', { reason: error.message });
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
            candidate.schemaVersion = 3;
            candidate.revision = current.value.revision + 1;
            candidate.updatedAt = this.clock.now();
            const validated = validateStateEnvelopeV3(candidate);
            if (!validated.ok) return validated;
            return this._write(validated.value);
        } catch (error) {
            return err('VALIDATION_ERROR', 'state v3 replace 失败', { reason: error.message });
        }
    }

    _write(state) {
        const json = JSON.stringify(state);
        try {
            this.storage.setItem(this.key, json);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法写入 v3 state', { reason: error.message });
        }
        const readBack = this.read();
        if (!readBack.ok) return readBack;
        if (JSON.stringify(readBack.value) !== json) {
            return err('STORAGE_CORRUPTED', 'v3 state 写入后读回不一致');
        }
        return ok(readBack.value);
    }
}

export default LocalStateRepositoryV3;
