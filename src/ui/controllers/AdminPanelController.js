import { DialogController } from '../components/DialogController.js';

export class AdminPanelController {
    constructor({
        auth,
        orderManager,
        document,
        notify,
        dialogFactory = options => new DialogController(options),
        formatDate = value => new Intl.DateTimeFormat('zh-CN').format(new Date(value))
    }) {
        this.auth = auth;
        this.orderManager = orderManager;
        this.document = document;
        this.notify = notify;
        this.formatDate = formatDate;
        this.overlay = document.getElementById('modal-container');
        this._buildDialog();
        this.dialogController = dialogFactory({
            overlay: this.overlay,
            dialog: this.dialog,
            closeButton: this.closeButton,
            initialFocus: this.closeButton
        });
    }

    open(trigger = null) {
        if (!this.auth.isAdmin()) {
            this.notify?.('无管理员权限');
            return false;
        }
        this.render();
        this.dialogController.open({ trigger, initialFocus: this.closeButton });
        return true;
    }

    close() {
        this.dialogController.close();
    }

    render() {
        const users = this.auth.getAllUsers();
        const stats = this.orderManager.getStatistics();
        const panel = this._element('div', 'admin-panel');
        panel.appendChild(this._element('h2', '', '管理员后台'));

        const orderSection = this._element('section', 'admin-section');
        orderSection.appendChild(this._element('h3', '', '订单统计'));
        orderSection.appendChild(this._element(
            'p',
            '',
            `总订单：${stats.totalOrders} · 已确认：${stats.confirmedOrders} · 总收入：¥${stats.totalRevenue}`
        ));
        panel.appendChild(orderSection);

        const userSection = this._element('section', 'admin-section');
        userSection.appendChild(this._element('h3', '', `用户管理（${users.length} 人）`));
        const table = this._element('table', 'admin-table');
        const head = this.document.createElement('thead');
        const headRow = this.document.createElement('tr');
        ['用户名', '姓名', '角色', '邮箱', '注册时间'].forEach(label => {
            headRow.appendChild(this._element('th', '', label));
        });
        head.appendChild(headRow);
        table.appendChild(head);

        const body = this.document.createElement('tbody');
        users.forEach(user => {
            const row = this.document.createElement('tr');
            const values = [
                user.username,
                user.name,
                user.role,
                user.email || '-',
                this._formatDate(user.createdAt)
            ];
            values.forEach(value => row.appendChild(this._element('td', '', value)));
            body.appendChild(row);
        });
        table.appendChild(body);
        userSection.appendChild(table);
        panel.appendChild(userSection);
        this.body.replaceChildren(panel);
    }

    _buildDialog() {
        if (!this.overlay) {
            throw new TypeError('AdminPanelController 缺少 modal-container');
        }
        this.dialog = this._element('div', 'modal-content admin-modal');
        this.dialog.tabIndex = -1;
        this.dialog.setAttribute('role', 'dialog');
        this.dialog.setAttribute('aria-modal', 'true');
        this.dialog.setAttribute('aria-labelledby', 'admin-dialog-title');

        const header = this._element('div', 'modal-header');
        const title = this._element('h2', '', '管理员后台');
        title.id = 'admin-dialog-title';
        this.closeButton = this._element('button', 'modal-close', '✕');
        this.closeButton.type = 'button';
        this.closeButton.setAttribute('aria-label', '关闭管理员后台');
        header.appendChild(title);
        header.appendChild(this.closeButton);
        this.body = this._element('div', 'modal-body');
        this.dialog.appendChild(header);
        this.dialog.appendChild(this.body);
        this.overlay.replaceChildren(this.dialog);
    }

    _formatDate(value) {
        try {
            return this.formatDate(value);
        } catch {
            return '-';
        }
    }

    _element(tagName, className = '', text = '') {
        const element = this.document.createElement(tagName);
        element.className = className;
        element.textContent = String(text ?? '');
        return element;
    }
}

export default AdminPanelController;
