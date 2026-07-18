export class BrowserIdGenerator {
    next(prefix) {
        const randomId = globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `${prefix}-${randomId}`;
    }
}

export default BrowserIdGenerator;
