import { ok } from '../../shared/Result.js';
import { ensureDemoInventories } from '../../infrastructure/catalog/DemoInventorySeeder.js';

export class CommercialApplication {
    constructor({
        v2Migration,
        v3Migration,
        booking,
        account,
        guestOwnerRepository,
        bookingDraftRepository,
        stateRepository,
        catalogRepository,
        clock
    }) {
        this.v2Migration = v2Migration;
        this.v3Migration = v3Migration;
        this.booking = booking;
        this.account = account;
        this.guestOwnerRepository = guestOwnerRepository;
        this.bookingDrafts = bookingDraftRepository;
        this.stateRepository = stateRepository;
        this.catalogRepository = catalogRepository;
        this.clock = clock;
    }

    initialize() {
        const v2 = this.v2Migration.run();
        if (!v2.ok) return v2;
        const v3 = this.v3Migration.run();
        if (!v3.ok) return v3;
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
            migrations: {
                v2: { migrated: v2.value.migrated, report: v2.value.report },
                v3: { migrated: v3.value.migrated, report: v3.value.report }
            }
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

export default CommercialApplication;
