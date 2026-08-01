import { createBrowserInternalApplication } from './bootstrapInternal.js';
import { OperationsController } from './ui/controllers/OperationsController.js';

const application = createBrowserInternalApplication();
const page = new OperationsController({
    application,
    operations: application.operations,
    account: application.account
});

page.start();
