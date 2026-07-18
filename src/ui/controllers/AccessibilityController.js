import { DialogController } from '../components/DialogController.js';

const HELP_GROUPS = [
    {
        title: '导航',
        items: [
            ['Tab', '在元素间移动焦点'],
            ['Shift + Tab', '反向移动焦点'],
            ['Alt + 1-9', '快速跳转到对应分区'],
            ['Enter', '激活按钮或提交表单'],
            ['Space', '激活按钮或切换复选框']
        ]
    },
    {
        title: '选座',
        items: [
            ['↑ ↓ ← →', '在 Canvas 聚焦时于座位间导航'],
            ['Enter', '选中或取消选中座位'],
            ['Space', '选中或取消选中座位']
        ]
    },
    {
        title: '其他',
        items: [
            ['Ctrl + K', '打开此帮助'],
            ['Ctrl + E', '导出数据'],
            ['Ctrl + I', '导入数据']
        ]
    }
];

export class AccessibilityController {
    constructor({
        document,
        browserWindow,
        speechService,
        scheduler,
        dialogFactory = options => new DialogController(options)
    }) {
        this.document = document;
        this.window = browserWindow;
        this.speechService = speechService;
        this.scheduler = scheduler;
        this.dialogFactory = dialogFactory;
        this.helpDialog = null;
        this.bound = false;
    }

    bind() {
        if (this.bound) {
            return;
        }
        this.bound = true;
        this.document.addEventListener('keydown', event => {
            if (this._isEditable(event.target)) {
                return;
            }
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 'k') {
                event.preventDefault();
                this.showKeyboardHelp(event.target);
            } else if (event.altKey && /^[1-9]$/.test(event.key)) {
                event.preventDefault();
                this.quickNavigate(Number.parseInt(event.key, 10));
            }
        });
    }

    setVoiceEnabled(enabled) {
        this.speechService.setVoiceEnabled(enabled);
    }

    speak(text, options = {}) {
        return this.speechService.speak(text, options);
    }

    announce(message, level = 'polite') {
        const announcement = this.document.createElement('div');
        announcement.className = 'sr-only';
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', level);
        announcement.textContent = message;
        this.document.body.appendChild(announcement);
        this.scheduler.setTimeout(() => announcement.remove(), 1000);
        this.speak(message);
    }

    quickNavigate(index) {
        const sections = this.document.querySelectorAll('.main-container > section');
        const section = sections[index - 1];
        if (!section) {
            return false;
        }
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const heading = section.querySelector('h2');
        if (heading) {
            heading.tabIndex = -1;
            heading.focus();
        }
        return true;
    }

    showKeyboardHelp(trigger = null) {
        if (!this.helpDialog) {
            this.helpDialog = this._createHelpDialog();
        }
        this.helpDialog.controller.open({ trigger, initialFocus: this.helpDialog.closeButton });
        this.speak('快捷键帮助已打开');
    }

    _createHelpDialog() {
        const overlay = this._element('div', 'modal-container keyboard-help');
        overlay.id = 'keyboard-help';
        overlay.setAttribute('aria-hidden', 'true');
        const dialog = this._element('div', 'modal-content');
        dialog.tabIndex = -1;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'keyboard-help-title');

        const header = this._element('div', 'modal-header');
        const title = this._element('h2', '', '键盘快捷键');
        title.id = 'keyboard-help-title';
        const closeButton = this._element('button', 'modal-close', '✕');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', '关闭键盘快捷键帮助');
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = this._element('div', 'modal-body');
        HELP_GROUPS.forEach(group => {
            body.appendChild(this._element('h3', '', group.title));
            const list = this.document.createElement('ul');
            group.items.forEach(([shortcut, description]) => {
                const item = this.document.createElement('li');
                item.appendChild(this._element('kbd', '', shortcut));
                item.appendChild(this._element('span', '', description));
                list.appendChild(item);
            });
            body.appendChild(list);
        });
        dialog.appendChild(header);
        dialog.appendChild(body);
        overlay.appendChild(dialog);
        this.document.body.appendChild(overlay);
        return {
            closeButton,
            controller: this.dialogFactory({ overlay, dialog, closeButton, initialFocus: closeButton })
        };
    }

    _element(tagName, className = '', text = '') {
        const element = this.document.createElement(tagName);
        element.className = className;
        element.textContent = text;
        return element;
    }

    _isEditable(target) {
        return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
    }
}

export default AccessibilityController;
