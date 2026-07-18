export function ok(value) {
    return Object.freeze({ ok: true, value });
}

export function err(code, message, details = {}) {
    return Object.freeze({
        ok: false,
        error: Object.freeze({ code, message, details: Object.freeze({ ...details }) })
    });
}
