import { ok } from '../../shared/Result.js';
import { ensureDemoInventories } from '../../infrastructure/catalog/DemoInventorySeeder.js';

export class TicketingApplication {
    constructor({
        stateInitializer,
        booking,
        account,
        preferences,
        guestOwnerRepository,
        bookingDraftRepository,
        stateRepository,
        catalogRepository,
        clock
    }) {
        this.stateInitializer = stateInitializer;
        this.booking = booking;
        this.account = account;
        this.preferences = preferences;
        this.guestOwnerRepository = guestOwnerRepository;
        this.bookingDrafts = bookingDraftRepository;
        this.stateRepository = stateRepository;
        this.catalogRepository = catalogRepository;
        this.clock = clock;
    }

    initialize() {
        const initialized = this.stateInitializer.run();
        if (!initialized.ok) return initialized;
        const seeded = ensureDemoInventories({
            stateRepository: this.stateRepository,
            catalogRepository: this.catalogRepository,
            clock: this.clock
        });
        if (!seeded.ok) return seeded;
        const swept = this.booking.sweepExpiredHolds();
        if (!swept.ok) return swept;
        return ok({
            state: swept.value.state,
            createdInventories: seeded.value.created,
            expiredHolds: swept.value.expiredCount,
            storageInitialized: initialized.value.initialized
        });
    }

    getBookingOwnerId() {
        return this.account.getCurrentUser()?.id || this.guestOwnerRepository.getOwnerId();
    }

    getBookingOwnerIds() {
        const userId = this.account.getCurrentUser()?.id;
        return [...new Set([userId, this.guestOwnerRepository.getOwnerId()].filter(Boolean))];
    }
}

export default TicketingApplication;
