import { ok } from '../../shared/Result.js';
import { createDefaultState } from './InitialState.js';

export class StateInitializer {
    constructor({ stateRepository, clock }) {
        if (!stateRepository) throw new TypeError('StateInitializer 需要 stateRepository');
        if (!clock || typeof clock.now !== 'function') {
            throw new TypeError('StateInitializer 需要 Clock 端口');
        }
        this.stateRepository = stateRepository;
        this.clock = clock;
    }

    run() {
        const current = this.stateRepository.read();
        if (current.ok) return ok({ state: current.value, initialized: false });
        if (current.error.code !== 'STATE_NOT_INITIALIZED') return current;

        const initialized = this.stateRepository.initialize(createDefaultState(this.clock.now()));
        if (!initialized.ok) {
            if (initialized.error.code !== 'STATE_CONFLICT') return initialized;
            const concurrent = this.stateRepository.read();
            if (!concurrent.ok) return concurrent;
            return ok({ state: concurrent.value, initialized: false });
        }
        return ok({ state: initialized.value, initialized: true });
    }
}

export default StateInitializer;
