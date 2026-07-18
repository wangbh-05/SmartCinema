import { createBookingDraft } from '../../domain/booking/BookingDraft.js';
import { err, ok } from '../../shared/Result.js';

export const BOOKING_DRAFT_STORAGE_KEY = 'smartcinema_commercial_booking_draft';

export class SessionBookingDraftRepository {
    constructor({ storage, key = BOOKING_DRAFT_STORAGE_KEY }) {
        if (!storage || typeof storage.getItem !== 'function' ||
            typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
            throw new TypeError('SessionBookingDraftRepository 需要 Storage-like 对象');
        }
        this.storage = storage;
        this.key = key;
    }

    get() {
        let raw;
        try {
            raw = this.storage.getItem(this.key);
        } catch (error) {
            return err('STORAGE_READ_FAILED', '无法读取选座草稿', { reason: error.message });
        }
        if (raw === null) return ok(null);
        try {
            return ok(createBookingDraft(JSON.parse(raw)));
        } catch (error) {
            return err('STORAGE_CORRUPTED', '选座草稿已损坏', {
                reason: error.message
            });
        }
    }

    save(draft) {
        let normalized;
        try {
            normalized = createBookingDraft(draft);
        } catch (error) {
            return err('VALIDATION_ERROR', error.message, error.details || {});
        }
        try {
            this.storage.setItem(this.key, JSON.stringify(normalized));
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法保存选座草稿', { reason: error.message });
        }
        return ok(normalized);
    }

    clear() {
        try {
            this.storage.removeItem(this.key);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法清除选座草稿', { reason: error.message });
        }
        return ok(null);
    }
}

export default SessionBookingDraftRepository;
