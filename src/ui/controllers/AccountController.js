export class AccountController {
    constructor({
        auth,
        document,
        confirmAction,
        notify,
        onOpenAuth,
        onOpenAdmin,
        onAuthChanged,
        onAnnounce
    }) {
        this.auth = auth;
        this.document = document;
        this.confirmAction = confirmAction;
        this.notify = notify;
        this.onOpenAuth = onOpenAuth;
        this.onOpenAdmin = onOpenAdmin;
        this.onAuthChanged = onAuthChanged;
        this.onAnnounce = onAnnounce;
        this.loginButton = document.getElementById('btn-login');
        this.registerButton = document.getElementById('btn-register');
        this.logoutButton = document.getElementById('btn-logout');
        this.adminButton = document.getElementById('btn-admin');
        this.userInfo = document.getElementById('user-info');
        this.bound = false;
    }

    bind() {
        if (this.bound) {
            return;
        }
        this.bound = true;
        this.loginButton?.addEventListener('click', () => this.onOpenAuth?.('login', this.loginButton));
        this.registerButton?.addEventListener('click', () => this.onOpenAuth?.('register', this.registerButton));
        this.logoutButton?.addEventListener('click', () => this.logout());
        this.adminButton?.addEventListener('click', () => this.onOpenAdmin?.(this.adminButton));
    }

    render() {
        const loggedIn = this.auth.isLoggedIn();
        const isAdmin = this.auth.isAdmin();
        const user = this.auth.getCurrentUser();
        this._setVisible(this.loginButton, !loggedIn);
        this._setVisible(this.registerButton, !loggedIn);
        this._setVisible(this.logoutButton, loggedIn);
        this._setVisible(this.adminButton, isAdmin);

        if (!this.userInfo) {
            return;
        }
        this.userInfo.replaceChildren();
        if (!loggedIn || !user) {
            this.userInfo.style.display = 'none';
            return;
        }

        const name = this.document.createElement('span');
        name.textContent = user.name;
        const badge = this.document.createElement('span');
        badge.className = `badge badge-${isAdmin ? 'primary' : 'success'}`;
        badge.textContent = isAdmin ? '管理员' : '会员';
        this.userInfo.appendChild(name);
        this.userInfo.appendChild(badge);
        this.userInfo.style.display = 'flex';
    }

    requireAuth() {
        if (this.auth.isLoggedIn()) {
            return true;
        }
        this.notify?.('请先登录后再操作');
        this.onOpenAuth?.('login', null);
        return false;
    }

    logout() {
        if (!this.confirmAction?.('确定要退出登录吗？')) {
            return false;
        }
        this.auth.logout();
        this.render();
        this.onAuthChanged?.();
        this.onAnnounce?.('已退出登录');
        return true;
    }

    _setVisible(element, visible) {
        if (!element) {
            return;
        }
        element.hidden = !visible;
        element.style.display = visible ? '' : 'none';
    }
}

export default AccountController;
