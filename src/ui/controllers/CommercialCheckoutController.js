import { DialogController } from '../components/DialogController.js';
import {
    appendText,
    formatDate,
    formatMoney,
    formatTime
} from '../commercial/CommerceView.js';

function element(id) {
    return document.getElementById(id);
}

export class CommercialCheckoutController {
    constructor({
        booking,
        account,
        bookingDrafts,
        clock,
        authDialog,
        getContext,
        onNotify = () => {},
        onAnnounce = () => {},
        onInventoryChanged = () => {},
        onCheckoutCompleted = () => {}
    }) {
        this.booking = booking;
        this.account = account;
        this.bookingDrafts = bookingDrafts;
        this.clock = clock;
        this.authDialog = authDialog;
        this.getContext = getContext;
        this.onNotify = onNotify;
        this.onAnnounce = onAnnounce;
        this.onInventoryChanged = onInventoryChanged;
        this.onCheckoutCompleted = onCheckoutCompleted;
        this.activeHold = null;
        this.holdOwnerId = null;
        this.confirmedOrder = null;
        this.holdTimer = null;
        this._setupDialog();
    }

    _setupDialog() {
        const overlay = element('checkout-dialog');
        this.dialog = new DialogController({
            overlay,
            dialog: overlay.querySelector('.checkout-dialog'),
            closeButton: element('checkout-close'),
            canCloseFromBackdrop: () => {
                this.onNotify('请使用右上角关闭按钮或“返回改座”');
                return false;
            },
            onClose: () => this._handleClosed()
        });
    }

    isHolding() {
        return Boolean(this.activeHold);
    }

    openHold({ hold, ownerId, trigger, restored = false }) {
        this.activeHold = hold;
        this.holdOwnerId = ownerId;
        this.confirmedOrder = null;
        this.render();
        this.dialog.open({ trigger });
        this._startTimer();
        this.onAnnounce(restored ? '已恢复仍在保留时间内的座位' : '座位已保留 10 分钟，请确认订单');
    }

    refreshForAuth() {
        this.render();
        if (this.dialog.isOpen()) {
            requestAnimationFrame(() => element('confirm-order')?.focus());
        }
    }

    render() {
        if (!this.activeHold && !this.confirmedOrder) return;
        const content = element('checkout-content');
        content.replaceChildren();
        if (this.confirmedOrder) {
            this._renderOrderSuccess(content, this.confirmedOrder);
            return;
        }

        const context = this.getContext();
        const hold = this.activeHold;
        const hero = document.createElement('div');
        hero.className = 'checkout-hero';
        appendText(hero, 'p', '订单确认', 'dialog-eyebrow');
        appendText(hero, 'h2', '座位已为你保留');
        const timer = appendText(hero, 'div', '剩余 10:00', 'checkout-timer');
        timer.id = 'hold-countdown';
        content.append(hero);

        const details = document.createElement('div');
        details.className = 'checkout-details';
        this._appendDetailRow(details, '影片', context.movie.title);
        this._appendDetailRow(
            details,
            '场次',
            `${formatDate(context.showtime.startsAt)} ${formatTime(context.showtime.startsAt)}`
        );
        this._appendDetailRow(details, '影厅', context.auditorium.name);
        const seatLabels = hold.seatIds.map(id =>
            context.auditorium.seats.find(seat => seat.id === id)?.label || id
        );
        this._appendDetailRow(details, '座位', seatLabels.join('、'));
        const total = document.createElement('div');
        total.className = 'checkout-detail-row checkout-total';
        appendText(total, 'span', '应付合计');
        appendText(total, 'strong', formatMoney(hold.pricingQuote.total));
        details.append(total);
        content.append(details);

        const user = this.account.getCurrentUser();
        const note = appendText(
            content,
            'p',
            user ? `订单将保存到 ${user.name} 的账户` : '无需登录即可锁座；确认订单前需要登录或注册。',
            'checkout-account-note'
        );
        note.id = 'checkout-account-note';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'primary-action';
        confirm.id = 'confirm-order';
        confirm.textContent = user ? `确认订单 · ${formatMoney(hold.pricingQuote.total)}` : '登录后确认订单';
        confirm.addEventListener('click', event => {
            if (!this.account.isLoggedIn()) {
                this.authDialog.open('login', event.currentTarget);
                return;
            }
            this._confirmOrder();
        });
        content.append(confirm);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'text-action checkout-secondary';
        back.textContent = '返回重新选座';
        back.addEventListener('click', () => this.dialog.close());
        content.append(back);
        this._updateCountdown();
    }

    _appendDetailRow(parent, label, value) {
        const row = document.createElement('div');
        row.className = 'checkout-detail-row';
        appendText(row, 'span', label);
        appendText(row, 'strong', value);
        parent.append(row);
    }

    _confirmOrder() {
        const user = this.account.getCurrentUser();
        if (!user || !this.activeHold) return;
        const result = this.booking.confirmHold({
            holdId: this.activeHold.id,
            actorOwnerId: this.holdOwnerId,
            userId: user.id
        });
        if (!result.ok) return this.onNotify(result.error.message);
        this.confirmedOrder = result.value.order;
        this.activeHold = null;
        this.bookingDrafts.clear();
        this._stopTimer();
        this.onInventoryChanged();
        this.render();
        this.onAnnounce(`订单确认成功，取票码 ${this.confirmedOrder.ticketCode}`);
    }

    _renderOrderSuccess(content, order) {
        const wrapper = document.createElement('div');
        wrapper.className = 'success-ticket';
        appendText(wrapper, 'div', '✓', 'success-icon');
        appendText(wrapper, 'p', '订单已确认', 'dialog-eyebrow');
        appendText(wrapper, 'h2', '购票成功');
        appendText(
            wrapper,
            'p',
            `${order.movieSnapshot.title} · ${formatDate(order.showtimeSnapshot.startsAt)} ${formatTime(order.showtimeSnapshot.startsAt)}`
        );
        const code = document.createElement('div');
        code.className = 'ticket-code';
        appendText(code, 'span', '电子取票码');
        appendText(code, 'strong', order.ticketCode);
        wrapper.append(code);
        const seats = order.seatSnapshots.map(seat => seat.label).join('、');
        appendText(wrapper, 'p', `${order.auditoriumSnapshot.name} · ${seats}`);
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'primary-action';
        done.textContent = '完成';
        done.addEventListener('click', () => this.dialog.close());
        wrapper.append(done);
        content.append(wrapper);
    }

    _startTimer() {
        this._stopTimer();
        this._updateCountdown();
        this.holdTimer = window.setInterval(() => this._updateCountdown(), 1000);
    }

    _stopTimer() {
        if (this.holdTimer !== null) window.clearInterval(this.holdTimer);
        this.holdTimer = null;
    }

    _updateCountdown() {
        if (!this.activeHold) return;
        const remaining = Math.max(0, Math.ceil(
            (Date.parse(this.activeHold.expiresAt) - Date.parse(this.clock.now())) / 1000
        ));
        const output = element('hold-countdown');
        if (output) {
            const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
            const seconds = String(remaining % 60).padStart(2, '0');
            output.textContent = `剩余 ${minutes}:${seconds}`;
        }
        if (remaining > 0) return;
        const expired = this.booking.expireHold(this.activeHold.id);
        this.activeHold = null;
        this._stopTimer();
        if (expired.ok) this.onInventoryChanged();
        this._renderExpired();
        this.onAnnounce('座位保留已到期并释放');
    }

    _renderExpired() {
        const content = element('checkout-content');
        content.replaceChildren();
        appendText(content, 'p', '锁座已结束', 'dialog-eyebrow');
        appendText(content, 'h2', '保留时间已到');
        appendText(content, 'p', '座位已释放，请返回座位图重新选择。', 'dialog-intro');
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'primary-action';
        back.textContent = '返回选座';
        back.addEventListener('click', () => this.dialog.close());
        content.append(back);
    }

    _handleClosed() {
        this._stopTimer();
        if (this.activeHold) {
            this.booking.releaseHold({
                holdId: this.activeHold.id,
                actorOwnerId: this.holdOwnerId,
                reason: 'change-seats'
            });
            this.activeHold = null;
            this.onInventoryChanged();
        }
        if (this.confirmedOrder) {
            this.confirmedOrder = null;
            this.bookingDrafts.clear();
            this.onCheckoutCompleted();
        }
        this.holdOwnerId = null;
    }
}

export default CommercialCheckoutController;
