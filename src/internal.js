import { createBrowserInternalApplication } from './bootstrapInternal.js';
import { CommercialOperationsController } from './ui/controllers/CommercialOperationsController.js';

const application = createBrowserInternalApplication();
const page = new CommercialOperationsController({
    application,
    operations: application.operations,
    account: application.account
});

page.start();
