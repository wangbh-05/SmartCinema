import { DialogController } from '../components/DialogController.js';

function element(id) {
    return document.getElementById(id);
}

export class CommercialPreferencesController {
    constructor({ preferences, account, onNotify = () => {}, onAnnounce = () => {} }) {
        this.preferences = preferences;
        this.account = account;
        this.onNotify = onNotify;
        this.onAnnounce = onAnnounce;
        this.bound = false;
        const overlay = element('preferences-dialog');
        this.dialog = new DialogController({
            overlay,
            dialog: overlay.querySelector('.preferences-dialog'),
            closeButton: element('preferences-close'),
            canCloseFromBackdrop: () => false
        });
        this.bind();
        this.refresh();
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        element('preference-readable').addEventListener('change', event => {
            this._update({ accessibilityMode: event.currentTarget.checked }, '增强可读性');
        });
        element('preference-colorblind').addEventListener('change', event => {
            this._update({ colorblindMode: event.currentTarget.checked }, '色觉友好座位状态');
        });
        element('preference-motion').addEventListener('change', event => {
            this._update({ reducedMotion: event.currentTarget.checked ? 'reduce' : 'system' }, '减少动态效果');
        });
    }

    open(trigger) {
        this.refresh();
        this.dialog.open({ trigger, initialFocus: element('preference-readable') });
    }

    refresh() {
        const result = this.preferences.get();
        if (!result.ok) {
            this.onNotify(result.error.message);
            return result;
        }
        const settings = result.value;
        element('preference-readable').checked = settings.accessibilityMode;
        element('preference-colorblind').checked = settings.colorblindMode;
        element('preference-motion').checked = settings.reducedMotion === 'reduce';
        const user = this.account.getCurrentUser();
        element('preferences-scope').textContent = user ?
            `偏好将保存到 ${user.name} 的账户。` :
            '当前为访客，偏好保存在本浏览器；登录后使用账户偏好。';
        this._apply(settings);
        return result;
    }

    _update(patch, label) {
        const result = this.preferences.update(patch);
        if (!result.ok) {
            this.refresh();
            this.onNotify(result.error.message);
            return;
        }
        this._apply(result.value.settings);
        this.onNotify(`${label}已${Object.values(patch)[0] === false || patch.reducedMotion === 'system' ? '关闭' : '开启'}`);
        this.onAnnounce(`${label}设置已更新`);
    }

    _apply(settings) {
        document.body.classList.toggle('commerce-readable', settings.accessibilityMode);
        document.body.classList.toggle('commerce-colorblind', settings.colorblindMode);
        document.documentElement.dataset.commerceMotion = settings.reducedMotion;
    }
}

export default CommercialPreferencesController;
