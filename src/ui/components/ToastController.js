export class ToastController {
    constructor({ document, scheduler = globalThis, duration = 2500 }) {
        if (!document?.body || typeof document.createElement !== 'function') {
            throw new TypeError('ToastController 需要 Document-like 对象');
        }
        if (typeof scheduler.setTimeout !== 'function' || typeof scheduler.clearTimeout !== 'function') {
            throw new TypeError('ToastController 需要 Scheduler-like 对象');
        }
        this.document = document;
        this.scheduler = scheduler;
        this.duration = duration;
        this.timer = null;
        this.element = this._getOrCreateElement();
    }

    show(message, { duration = this.duration } = {}) {
        this.element.textContent = String(message);
        this.element.dataset.visible = 'true';
        if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
        this.timer = this.scheduler.setTimeout(() => this.hide(), duration);
    }

    hide() {
        this.element.dataset.visible = 'false';
        if (this.timer !== null) {
            this.scheduler.clearTimeout(this.timer);
            this.timer = null;
        }
    }

    _getOrCreateElement() {
        const existing = this.document.getElementById('global-toast');
        if (existing) return existing;
        const element = this.document.createElement('div');
        element.id = 'global-toast';
        element.className = 'global-toast';
        element.dataset.visible = 'false';
        element.setAttribute('role', 'status');
        element.setAttribute('aria-live', 'polite');
        element.setAttribute('aria-atomic', 'true');
        this.document.body.appendChild(element);
        return element;
    }
}

export default ToastController;
