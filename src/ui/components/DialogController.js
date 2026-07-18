const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * 统一 Dialog 行为：Escape、焦点归还、焦点陷阱和安全的 backdrop pointer 手势。
 */
export class DialogController {
    constructor({
        overlay,
        dialog,
        closeButton,
        initialFocus = null,
        canCloseFromBackdrop = () => true,
        onClose = () => {}
    }) {
        if (!overlay || !dialog || !closeButton) throw new TypeError('DialogController 缺少必要 DOM');
        this.overlay = overlay;
        this.dialog = dialog;
        this.closeButton = closeButton;
        this.initialFocus = initialFocus;
        this.canCloseFromBackdrop = canCloseFromBackdrop;
        this.onClose = onClose;
        this.opener = null;
        this.pointerStartedOnBackdrop = false;
        this.bound = false;
        this._bind();
    }

    isOpen() {
        return this.overlay.classList.contains('active');
    }

    open({ trigger = null, initialFocus = this.initialFocus } = {}) {
        if (!this.isOpen()) {
            const candidate = trigger || document.activeElement;
            this.opener = candidate instanceof HTMLElement ? candidate : null;
        }
        this.overlay.classList.add('active');
        this.overlay.setAttribute('aria-hidden', 'false');
        const target = initialFocus || this._focusableElements()[0] || this.dialog;
        window.requestAnimationFrame(() => target?.focus());
    }

    close({ restoreFocus = true } = {}) {
        if (!this.isOpen()) return;
        this.overlay.classList.remove('active');
        this.overlay.setAttribute('aria-hidden', 'true');
        this.pointerStartedOnBackdrop = false;
        if (restoreFocus && this.opener?.isConnected) this.opener.focus();
        this.opener = null;
        this.onClose();
    }

    _bind() {
        if (this.bound) return;
        this.bound = true;
        this.closeButton.addEventListener('click', () => this.close());
        this.overlay.addEventListener('pointerdown', event => {
            this.pointerStartedOnBackdrop = event.target === this.overlay;
        });
        this.overlay.addEventListener('pointerup', event => {
            const shouldClose = this.pointerStartedOnBackdrop && event.target === this.overlay;
            this.pointerStartedOnBackdrop = false;
            if (shouldClose && this.canCloseFromBackdrop()) this.close();
        });
        this.overlay.addEventListener('pointercancel', () => {
            this.pointerStartedOnBackdrop = false;
        });
        document.addEventListener('keydown', event => {
            if (!this.isOpen()) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
                return;
            }
            if (event.key === 'Tab') this._trapFocus(event);
        });
    }

    _focusableElements() {
        return [...this.dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
            .filter(element => !element.closest('[hidden]') && element.getClientRects().length > 0);
    }

    _trapFocus(event) {
        const focusable = this._focusableElements();
        if (focusable.length === 0) {
            event.preventDefault();
            this.dialog.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
}

export default DialogController;
