import { AppController } from './application/AppController.js';
import { BrowserClock } from './infrastructure/browser/BrowserClock.js';
import { BrowserIdGenerator } from './infrastructure/browser/BrowserIdGenerator.js';
import { LocalStateRepository } from './infrastructure/storage/LocalStateRepository.js';
import { V1ToV2Migration } from './infrastructure/storage/MigrateV1ToV2.js';
import { SessionCheckoutIntentRepository } from './infrastructure/storage/SessionCheckoutIntentRepository.js';

export function createBrowserAppController({
    localStorage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    clock = new BrowserClock(),
    idGenerator = new BrowserIdGenerator()
} = {}) {
    const stateRepository = new LocalStateRepository({ storage: localStorage, clock });
    const checkoutIntentRepository = new SessionCheckoutIntentRepository({ storage: sessionStorage });
    const migration = new V1ToV2Migration({
        localStorage,
        sessionStorage,
        clock,
        idGenerator
    });
    return new AppController({
        stateRepository,
        checkoutIntentRepository,
        migration,
        clock,
        idGenerator
    });
}
