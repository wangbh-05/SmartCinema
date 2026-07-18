export const GUEST_OWNER_STORAGE_KEY = 'smartcinema_commercial_guest_owner';

export class SessionGuestOwnerRepository {
    constructor({ storage, idGenerator }) {
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('SessionGuestOwnerRepository 需要 Storage-like 对象');
        }
        if (!idGenerator || typeof idGenerator.next !== 'function') {
            throw new TypeError('SessionGuestOwnerRepository 需要 IdGenerator');
        }
        this.storage = storage;
        this.idGenerator = idGenerator;
    }

    getOwnerId() {
        const stored = this.storage.getItem(GUEST_OWNER_STORAGE_KEY);
        if (typeof stored === 'string' && stored.startsWith('guest:') && stored.length > 6) {
            return stored;
        }
        const ownerId = `guest:${this.idGenerator.next('session')}`;
        this.storage.setItem(GUEST_OWNER_STORAGE_KEY, ownerId);
        return ownerId;
    }
}

export default SessionGuestOwnerRepository;
