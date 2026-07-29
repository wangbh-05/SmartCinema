import { OperationsService } from './application/ticketing/OperationsService.js';
import { createBrowserTicketingApplication } from './bootstrapTicketing.js';
import { StateBackupService } from './infrastructure/storage/StateBackupService.js';

export function createBrowserInternalApplication(options = {}) {
    const storage = options.localStorage || globalThis.localStorage;
    const app = createBrowserTicketingApplication({
        ...options,
        localStorage: storage
    });
    const backup = new StateBackupService({
        stateRepository: app.stateRepository,
        storage,
        clock: app.clock
    });
    const operations = new OperationsService({
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
