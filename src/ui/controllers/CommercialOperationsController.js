import { formatDate, formatMoney, formatTime } from '../commercial/CommerceView.js';
import { DialogController } from '../components/DialogController.js';

function element(id) {
    return document.getElementById(id);
}

function appendText(parent, tagName, text, className = '') {
    const child = document.createElement(tagName);
    child.textContent = String(text ?? '');
    if (className) child.className = className;
    parent.append(child);
    return child;
}

function formatDateTime(value) {
    return value ? `${formatDate(value, true)} ${formatTime(value)}` : '—';
}

export class CommercialOperationsController {
    constructor({ application, operations, account }) {
        this.application = application;
        this.operations = operations;
        this.account = account;
        this.pendingAction = null;
        this.pendingImport = null;
        this.toastTimer = null;
        this._setupDialog();
        this._bind();
    }

    start() {
        const initialized = this.application.initialize();
        if (!initialized.ok) {
            this._renderFatal(initialized.error.message);
            return;
        }
        this._renderAccessState();
    }

    _setupDialog() {
        const overlay = element('operations-confirm-dialog');
        this.confirmDialog = new DialogController({
            overlay,
            dialog: overlay.querySelector('.operations-dialog'),
            closeButton: element('operations-confirm-close'),
            canCloseFromBackdrop: () => false,
            onClose: () => {
                if (this.pendingAction?.type === 'import-backup') this.pendingImport = null;
                this.pendingAction = null;
            }
        });
    }

    _bind() {
        element('operations-login-form').addEventListener('submit', event => {
            event.preventDefault();
            this._login();
        });
        element('operations-logout').addEventListener('click', () => {
            this.account.logout();
            this._renderAccessState();
            this._notify('已退出内部运维台');
        });
        element('operations-refresh').addEventListener('click', () => this.refresh());
        element('operations-sweep').addEventListener('click', () => this._sweepExpired());
        element('operations-holds').addEventListener('click', event => {
            const trigger = event.target.closest('[data-release-hold-id]');
            if (trigger) this._requestHoldRelease(trigger.dataset.releaseHoldId, trigger);
        });
        element('operations-export-safe').addEventListener('click', () => this._exportBackup(false));
        element('operations-export-full').addEventListener('click', event => {
            this._openConfirmation({
                type: 'export-full',
                trigger: event.currentTarget,
                eyebrow: '含本地演示凭证',
                title: '下载完整恢复备份？',
                message: '文件中包含本地演示用户的明文凭证。请只保存在受控环境，不要上传或共享。',
                actionLabel: '确认下载'
            });
        });
        element('operations-import').addEventListener('click', () => element('operations-import-file').click());
        element('operations-import-file').addEventListener('change', event => this._prepareImport(event));
        element('operations-confirm-cancel').addEventListener('click', () => this.confirmDialog.close());
        element('operations-confirm-action').addEventListener('click', () => this._runPendingAction());
    }

    _login() {
        const username = element('operations-username').value.trim();
        const password = element('operations-password').value;
        const error = element('operations-login-error');
        error.textContent = '';
        if (!username || !password) {
            error.textContent = '请输入管理员用户名和密码';
            error.focus();
            return;
        }
        const result = this.account.login(username, password);
        if (!result.ok) {
            error.textContent = result.error.message;
            error.focus();
            return;
        }
        if (!this.account.isAdmin()) {
            this.account.logout();
            error.textContent = '该账号没有内部运维权限';
            error.focus();
            return;
        }
        element('operations-password').value = '';
        this._renderAccessState();
        this._announce('管理员登录成功，已进入放映运维概览');
    }

    _renderAccessState() {
        const user = this.account.getCurrentUser();
        const allowed = user?.role === 'admin';
        element('operations-access-gate').hidden = allowed;
        element('operations-dashboard').hidden = !allowed;
        element('operations-logout').hidden = !allowed;
        element('operator-info').hidden = !allowed;
        element('operator-info').textContent = allowed ? `${user.name} · 管理员` : '';
        document.documentElement.dataset.operationsStatus = allowed ? 'dashboard-ready' : 'access-gate';
        if (allowed) this.refresh();
        else requestAnimationFrame(() => element('operations-username').focus());
    }

    refresh() {
        const result = this.operations.getDashboard();
        if (!result.ok) {
            if (['AUTH_REQUIRED', 'FORBIDDEN'].includes(result.error.code)) {
                this._renderAccessState();
                return;
            }
            this._notify(result.error.message);
            return;
        }
        this.dashboard = result.value;
        this._renderDashboard(result.value);
    }

    _renderDashboard(dashboard) {
        element('operations-sync-meta').textContent =
            `State r${dashboard.stateRevision} · ${formatDateTime(dashboard.generatedAt)} 刷新`;
        element('metric-showtimes').textContent = String(dashboard.summary.showtimeCount);
        element('metric-holds').textContent = String(dashboard.summary.activeHoldCount);
        element('metric-orders').textContent = String(dashboard.summary.confirmedOrderCount);
        element('metric-cancelled').textContent = `${dashboard.summary.cancelledOrderCount} 笔已取消`;
        element('metric-revenue').textContent = formatMoney(dashboard.summary.grossRevenue);
        element('metric-refunds').textContent = `${formatMoney(dashboard.summary.pendingRefunds)} 待退款`;
        element('active-hold-count').textContent = String(dashboard.activeHolds.length);
        this._renderAlert(dashboard);
        this._renderShowtimes(dashboard.showtimes);
        this._renderHolds(dashboard.activeHolds);
        this._renderOrders(dashboard.recentOrders);
        this._renderUsers(dashboard.users);
    }

    _renderAlert(dashboard) {
        const alert = element('operations-alert');
        const messages = [];
        if (dashboard.summary.staleHoldCount > 0) {
            messages.push(`${dashboard.summary.staleHoldCount} 个锁座已超过到期时间，请执行清理`);
        }
        if (dashboard.migration.warnings.length > 0) {
            messages.push(`迁移报告有 ${dashboard.migration.warnings.length} 条提示`);
        }
        alert.hidden = messages.length === 0;
        alert.textContent = messages.join('；');
    }

    _renderShowtimes(showtimes) {
        const body = element('operations-showtimes');
        body.replaceChildren();
        showtimes.forEach(showtime => {
            const row = document.createElement('tr');
            const context = document.createElement('td');
            const label = document.createElement('div');
            label.className = 'showtime-cell';
            appendText(label, 'strong', `${formatTime(showtime.startsAt)} · ${showtime.movieTitle}`);
            appendText(label, 'span', `${showtime.auditoriumName} · ${formatDate(showtime.startsAt)}`);
            context.append(label);
            row.append(context);
            [showtime.soldCount, showtime.heldCount, showtime.availableCount].forEach(value =>
                appendText(row, 'td', value)
            );
            const occupancy = document.createElement('td');
            const occupancyCell = document.createElement('div');
            occupancyCell.className = 'occupancy-cell';
            const progress = document.createElement('progress');
            progress.max = 100;
            progress.value = Math.round(showtime.occupancyRate * 100);
            progress.setAttribute('aria-label', `上座率 ${progress.value}%`);
            occupancyCell.append(progress);
            appendText(occupancyCell, 'span', `${progress.value}%`);
            occupancy.append(occupancyCell);
            row.append(occupancy);
            appendText(row, 'td', `r${showtime.inventoryRevision}`);
            body.append(row);
        });
    }

    _renderHolds(holds) {
        const list = element('operations-holds');
        list.replaceChildren();
        if (holds.length === 0) {
            appendText(list, 'p', '当前没有有效锁座。', 'empty-records');
            return;
        }
        holds.forEach(hold => {
            const card = document.createElement('article');
            card.className = 'record-card';
            const header = document.createElement('div');
            header.className = 'record-card-header';
            appendText(header, 'strong', `${hold.movieTitle} · ${hold.seatIds.join('、')}`);
            appendText(header, 'span', '有效', 'status-chip');
            card.append(header);
            appendText(card, 'p', `${hold.ownerLabel} · ${hold.auditoriumName}`);
            const footer = document.createElement('div');
            footer.className = 'record-card-footer';
            appendText(footer, 'span', `${formatTime(hold.expiresAt)} 到期`, 'muted');
            const release = appendText(footer, 'button', '释放锁座', 'inline-danger');
            release.type = 'button';
            release.dataset.releaseHoldId = hold.id;
            card.append(footer);
            list.append(card);
        });
    }

    _renderOrders(orders) {
        const list = element('operations-orders');
        list.replaceChildren();
        if (orders.length === 0) {
            appendText(list, 'p', '还没有订单事件。', 'empty-records');
            return;
        }
        orders.forEach(order => {
            const card = document.createElement('article');
            card.className = 'record-card';
            const header = document.createElement('div');
            header.className = 'record-card-header';
            appendText(header, 'strong', order.movieSnapshot.title);
            const status = appendText(
                header,
                'span',
                order.status === 'confirmed' ? '已确认' : '已取消',
                `status-chip${order.status === 'cancelled' ? ' is-cancelled' : ''}`
            );
            status.title = order.status;
            card.append(header);
            appendText(card, 'p', `${formatDateTime(order.showtimeSnapshot.startsAt)} · ${order.seatSnapshots.map(seat => seat.label).join('、')}`);
            const footer = document.createElement('div');
            footer.className = 'record-card-footer';
            appendText(footer, 'span', order.ticketCode, 'muted');
            appendText(footer, 'strong', formatMoney(order.pricingQuote.total));
            card.append(footer);
            list.append(card);
        });
    }

    _renderUsers(users) {
        const body = element('operations-users');
        body.replaceChildren();
        users.forEach(user => {
            const row = document.createElement('tr');
            [
                user.username,
                user.name,
                user.role === 'admin' ? '管理员' : '会员',
                user.email || '—',
                formatDateTime(user.createdAt)
            ].forEach(value => appendText(row, 'td', value));
            body.append(row);
        });
    }

    _sweepExpired() {
        const result = this.operations.sweepExpiredHolds();
        if (!result.ok) return this._notify(result.error.message);
        this.refresh();
        this._notify(result.value.expiredCount > 0 ?
            `已释放 ${result.value.expiredCount} 个过期锁座` : '没有需要清理的过期锁座');
    }

    _requestHoldRelease(holdId, trigger) {
        const hold = this.dashboard?.activeHolds.find(item => item.id === holdId);
        if (!hold) return this._notify('锁座数据已变化，请刷新后重试');
        this._openConfirmation({
            type: 'release-hold',
            holdId,
            trigger,
            eyebrow: '会立即释放库存',
            title: `释放 ${hold.seatIds.length} 个锁座座位？`,
            message: `${hold.movieTitle} ${hold.seatIds.join('、')}将立即回到可售库存。原购票会话将无法继续确认。`,
            actionLabel: '确认释放'
        });
    }

    _openConfirmation({ type, trigger, eyebrow, title, message, actionLabel, ...details }) {
        this.pendingAction = { type, ...details };
        element('operations-confirm-eyebrow').textContent = eyebrow;
        element('operations-confirm-title').textContent = title;
        element('operations-confirm-message').textContent = message;
        element('operations-confirm-action').textContent = actionLabel;
        this.confirmDialog.open({ trigger, initialFocus: element('operations-confirm-cancel') });
    }

    _runPendingAction() {
        const action = this.pendingAction;
        if (!action) return;
        if (action.type === 'release-hold') {
            const result = this.operations.releaseHold(action.holdId);
            if (!result.ok) return this._notify(result.error.message);
            this.confirmDialog.close({ restoreFocus: false });
            this.refresh();
            this._notify('锁座已释放，场次库存已更新');
            element('operations-refresh').focus();
            return;
        }
        if (action.type === 'export-full') {
            this.confirmDialog.close();
            this._exportBackup(true);
            return;
        }
        if (action.type === 'import-backup') this._importBackup();
    }

    _exportBackup(includeCredentials) {
        const result = this.operations.exportBackup({ includeCredentials });
        if (!result.ok) return this._notify(result.error.message);
        const suffix = includeCredentials ? 'recovery' : 'diagnostic';
        this._downloadJson(result.value.json, `smartcinema-v3-${suffix}-${Date.now()}.json`);
        this._notify(includeCredentials ? '完整恢复备份已下载' : '脱敏诊断快照已下载');
    }

    async _prepareImport(event) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return this._notify('备份文件不得超过 5 MB');
        try {
            this.pendingImport = { name: file.name, json: await file.text() };
        } catch {
            return this._notify('无法读取所选备份文件');
        }
        this._openConfirmation({
            type: 'import-backup',
            trigger: element('operations-import'),
            eyebrow: '破坏性数据替换',
            title: '用备份替换当前数据？',
            message: `将导入“${file.name}”。系统会先保存回滚快照，再替换 v3 状态并退出当前账号。`,
            actionLabel: '确认替换'
        });
    }

    _importBackup() {
        if (!this.pendingImport) return;
        const result = this.operations.importBackup(this.pendingImport.json);
        if (!result.ok) {
            this.confirmDialog.close();
            this.pendingImport = null;
            return this._notify(result.error.message);
        }
        this.confirmDialog.close({ restoreFocus: false });
        this.pendingImport = null;
        this._renderAccessState();
        this._notify('备份已恢复，导入前回滚快照已保留；请重新登录');
        this._announce('数据恢复完成，当前会话已清除');
    }

    _downloadJson(json, filename) {
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    _notify(message) {
        const toast = element('operations-toast');
        toast.textContent = message;
        toast.hidden = false;
        if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => {
            toast.hidden = true;
            this.toastTimer = null;
        }, 3200);
    }

    _announce(message) {
        const region = element('operations-live-region');
        region.textContent = '';
        requestAnimationFrame(() => {
            region.textContent = message;
        });
    }

    _renderFatal(message) {
        element('operations-access-gate').hidden = true;
        element('operations-dashboard').hidden = true;
        element('operations-fatal').hidden = false;
        element('operations-fatal-message').textContent = message;
        document.documentElement.dataset.operationsStatus = 'fatal';
    }
}

export default CommercialOperationsController;
