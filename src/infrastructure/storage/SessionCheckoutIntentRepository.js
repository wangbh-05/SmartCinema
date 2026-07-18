import { err, ok } from '../../shared/Result.js';
import {
    consumeCheckoutIntent,
    rehydrateCheckoutIntent
} from '../../domain/order/CheckoutIntent.js';

export const CHECKOUT_STORAGE_KEY = 'smartcinema_checkout_v2';

export class SessionCheckoutIntentRepository {
    constructor({ storage, key = CHECKOUT_STORAGE_KEY }) {
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('SessionCheckoutIntentRepository 需要 Storage-like 对象');
        }
        this.storage = storage;
        this.key = key;
    }

    get() {
        const raw = this.storage.getItem(this.key);
        if (raw === null) return err('CHECKOUT_NOT_FOUND', '结算意图不存在');
        try {
            return ok(rehydrateCheckoutIntent(JSON.parse(raw)));
        } catch (error) {
            this.clear();
            return err('CHECKOUT_NOT_FOUND', '结算意图损坏，已清除', { reason: error.message });
        }
    }

    save(intent) {
        try {
            const validated = rehydrateCheckoutIntent(JSON.parse(JSON.stringify(intent)));
            this.storage.setItem(this.key, JSON.stringify(validated));
            return ok(validated);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法保存结算意图', { reason: error.message });
        }
    }

    consume(intentId, orderId) {
        const current = this.get();
        if (!current.ok) return current;
        if (current.value.id !== intentId) {
            return err('CHECKOUT_NOT_FOUND', '结算意图 ID 不匹配');
        }
        const consumed = consumeCheckoutIntent(current.value, orderId);
        if (!consumed.ok) return consumed;
        return this.save(consumed.value);
    }

    clear() {
        try {
            this.storage.removeItem(this.key);
            return ok(null);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法清除结算意图', { reason: error.message });
        }
    }
}

export default SessionCheckoutIntentRepository;
