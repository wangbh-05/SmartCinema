import { DialogController } from '../components/DialogController.js';

export class AuthDialogController {
    constructor({ auth, onAuthChanged, onAnnounce, onNotify }) {
        this.auth = auth;
        this.onAuthChanged = onAuthChanged;
        this.onAnnounce = onAnnounce;
        this.onNotify = onNotify;
        this.mode = 'login';
        this.overlay = document.getElementById('auth-modal');
        this.dialog = this.overlay?.querySelector('.auth-modal');
        this.form = document.getElementById('auth-form');
        this.title = document.getElementById('auth-title');
        this.submitButton = document.getElementById('auth-submit');
        this.switchButton = document.getElementById('auth-switch');
        this.error = document.getElementById('auth-error');
        this.username = document.getElementById('auth-username');
        this.password = document.getElementById('auth-password');
        this.name = document.getElementById('auth-name');
        this.email = document.getElementById('auth-email');
        this.extraFields = document.getElementById('register-extra-fields');
        this.dirty = false;
        this.dialogController = new DialogController({
            overlay: this.overlay,
            dialog: this.dialog,
            closeButton: document.getElementById('auth-modal-close'),
            initialFocus: this.username,
            canCloseFromBackdrop: () => this._canCloseFromBackdrop(),
            onClose: () => this._resetForm()
        });
        this._bind();
    }

    open(mode = 'login', trigger = null) {
        this._resetForm();
        this.setMode(mode);
        this.dialogController.open({ trigger, initialFocus: this.username });
    }

    close() {
        this.dialogController.close();
    }

    setMode(mode) {
        this.mode = mode === 'register' ? 'register' : 'login';
        const registering = this.mode === 'register';
        this.title.textContent = registering ? '注册会员' : '用户登录';
        this.submitButton.textContent = registering ? '注 册' : '登 录';
        this.switchButton.textContent = registering ? '已有账号？立即登录' : '没有账号？立即注册';
        this.extraFields.hidden = !registering;
        this.name.required = registering;
        this._clearError();
    }

    submit() {
        const username = this.username.value.trim();
        const password = this.password.value;
        let result;
        if (this.mode === 'register') {
            result = this.auth.register({
                username,
                password,
                name: this.name.value.trim(),
                email: this.email.value.trim()
            });
        } else {
            result = this.auth.login(username, password);
        }

        if (!result.success) {
            this.showError(result.message);
            return result;
        }

        const registered = this.mode === 'register';
        this.close();
        this.onAuthChanged?.();
        this.onAnnounce?.(`${registered ? '注册' : '登录'}成功，欢迎${result.user.name}`);
        if (registered) this.onNotify?.('注册成功，已自动登录');
        return result;
    }

    showError(message) {
        this.error.textContent = message;
        this.error.style.display = 'block';
        this.error.focus();
    }

    _clearError() {
        this.error.textContent = '';
        this.error.style.display = 'none';
    }

    _bind() {
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            this.submit();
        });
        this.form.addEventListener('input', () => {
            this.dirty = true;
        });
        this.switchButton.addEventListener('click', () => {
            this.setMode(this.mode === 'login' ? 'register' : 'login');
            this.username.focus();
        });
    }

    _canCloseFromBackdrop() {
        if (!this.dirty) return true;
        this.onNotify?.('表单尚未提交，可使用右上角关闭按钮退出');
        return false;
    }

    _resetForm() {
        this.form.reset();
        this.dirty = false;
        this._clearError();
    }
}

export default AuthDialogController;
