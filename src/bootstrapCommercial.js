import { CommercialAccountService } from './application/commercial/CommercialAccountService.js';
import { CommercialApplication } from './application/commercial/CommercialApplication.js';
import { CommercialBookingService } from './application/commercial/CommercialBookingService.js';
import { CommercialPreferencesService } from './application/commercial/CommercialPreferencesService.js';
import { BrowserClock } from './infrastructure/browser/BrowserClock.js';
import { businessDateInTimeZone } from './infrastructure/browser/BusinessDate.js';
import { BrowserIdGenerator } from './infrastructure/browser/BrowserIdGenerator.js';
import {
    createDemoCatalog,
    DemoCatalogRepository
} from './infrastructure/catalog/DemoCatalogRepository.js';
import { LocalStateRepositoryV3 } from './infrastructure/storage/LocalStateRepositoryV3.js';
import { MigrateV2ToV3 } from './infrastructure/storage/MigrateV2ToV3.js';
import { V1ToV2Migration } from './infrastructure/storage/MigrateV1ToV2.js';
import { SessionGuestOwnerRepository } from './infrastructure/storage/SessionGuestOwnerRepository.js';
import { SessionBookingDraftRepository } from './infrastructure/storage/SessionBookingDraftRepository.js';

export function createBrowserCommercialApplication({
    localStorage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    clock = new BrowserClock(),
    idGenerator = new BrowserIdGenerator(),
    businessDate = businessDateInTimeZone(clock.now())
} = {}) {
    const catalogRepository = new DemoCatalogRepository(createDemoCatalog(businessDate));
    const stateRepository = new LocalStateRepositoryV3({ storage: localStorage, clock });
    const v2Migration = new V1ToV2Migration({
        localStorage,
        sessionStorage,
        clock,
        idGenerator
    });
    const v3Migration = new MigrateV2ToV3({
        storage: localStorage,
        v3Repository: stateRepository,
        clock
    });
    const booking = new CommercialBookingService({
        catalogRepository,
        stateRepository,
        clock,
        idGenerator
    });
    const account = new CommercialAccountService({ stateRepository, clock, idGenerator });
    const preferences = new CommercialPreferencesService({ stateRepository });
    const guestOwnerRepository = new SessionGuestOwnerRepository({
        storage: sessionStorage,
        idGenerator
    });
    const bookingDraftRepository = new SessionBookingDraftRepository({ storage: sessionStorage });
    return new CommercialApplication({
        v2Migration,
        v3Migration,
        booking,
        account,
        preferences,
        guestOwnerRepository,
        bookingDraftRepository,
        stateRepository,
        catalogRepository,
        clock
    });
}
