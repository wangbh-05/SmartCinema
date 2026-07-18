import { CommercialOperationsService } from './application/commercial/CommercialOperationsService.js';
import { createBrowserCommercialApplication } from './bootstrapCommercial.js';
import { StateBackupServiceV3 } from './infrastructure/storage/StateBackupServiceV3.js';

export function createBrowserInternalApplication(options = {}) {
    const storage = options.localStorage || globalThis.localStorage;
    const app = createBrowserCommercialApplication({
        ...options,
        localStorage: storage
    });
    const backup = new StateBackupServiceV3({
        stateRepository: app.stateRepository,
        storage,
        clock: app.clock
    });
    const operations = new CommercialOperationsService({
        stateRepository: app.stateRepository,
        booking: app.booking,
        backup,
        clock: app.clock
    });
    return Object.freeze({
        initialize: () => app.initialize(),
        account: app.account,
        operations,
        clock: app.clock
    });
}

export default createBrowserInternalApplication;
