import { AccountService } from './application/ticketing/AccountService.js';
import { TicketingApplication } from './application/ticketing/TicketingApplication.js';
import { BookingService } from './application/ticketing/BookingService.js';
import { PreferencesService } from './application/ticketing/PreferencesService.js';
import { BrowserClock } from './infrastructure/browser/BrowserClock.js';
import { businessDateInTimeZone } from './infrastructure/browser/BusinessDate.js';
import { BrowserIdGenerator } from './infrastructure/browser/BrowserIdGenerator.js';
import {
    createDemoCatalog,
    DemoCatalogRepository
} from './infrastructure/catalog/DemoCatalogRepository.js';
import { LocalStateRepository } from './infrastructure/storage/LocalStateRepository.js';
import { StateInitializer } from './infrastructure/storage/StateInitializer.js';
import { SessionGuestOwnerRepository } from './infrastructure/storage/SessionGuestOwnerRepository.js';
import { SessionBookingDraftRepository } from './infrastructure/storage/SessionBookingDraftRepository.js';

export function createBrowserTicketingApplication({
    localStorage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    clock = new BrowserClock(),
    idGenerator = new BrowserIdGenerator(),
    businessDate = businessDateInTimeZone(clock.now())
} = {}) {
    const catalogRepository = new DemoCatalogRepository(createDemoCatalog(businessDate));
    const stateRepository = new LocalStateRepository({ storage: localStorage, clock });
    const stateInitializer = new StateInitializer({ stateRepository, clock });
    const booking = new BookingService({
        catalogRepository,
        stateRepository,
        clock,
        idGenerator
    });
    const account = new AccountService({ stateRepository, clock, idGenerator });
    const preferences = new PreferencesService({ stateRepository });
    const guestOwnerRepository = new SessionGuestOwnerRepository({
        storage: sessionStorage,
        idGenerator
    });
    const bookingDraftRepository = new SessionBookingDraftRepository({ storage: sessionStorage });
    return new TicketingApplication({
        stateInitializer,
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
