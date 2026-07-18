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

export class CommercialOrdersController {
    constructor({
        booking,
        account,
        onNotify = () => {},
        onAnnounce = () => {},
        onInventoryChanged = () => {}
    }) {
        this.booking = booking;
        this.account = account;
        this.onNotify = onNotify;
        this.onAnnounce = onAnnounce;
        this.onInventoryChanged = onInventoryChanged;
        this.pendingCancellationOrder = null;
        this._setupDialogs();
        this._bindEvents();
    }

    open(user, trigger) {
        const rendered = this.render(user.id);
        if (!rendered.ok) {
            this.onNotify(rendered.error.message);
            return rendered;
        }
        this.ordersDialog.open({ trigger });
        return rendered;
    }

    render(userId) {
        const result = this.booking.listOrders(userId);
        if (!result.ok) return result;
        const list = element('orders-list');
        list.replaceChildren();
        if (result.value.length === 0) {
            appendText(list, 'p', '还没有订单，完成一次选座后会显示在这里。', 'empty-state');
        } else {
            result.value.forEach(order => list.append(this._createOrderCard(order)));
        }
        return result;
    }

    _setupDialogs() {
        const ordersOverlay = element('orders-dialog');
        this.ordersDialog = new DialogController({
            overlay: ordersOverlay,
            dialog: ordersOverlay.querySelector('.orders-dialog'),
            closeButton: element('orders-close'),
            canCloseFromBackdrop: () => false
        });

        const refundOverlay = element('refund-dialog');
        this.refundDialog = new DialogController({
            overlay: refundOverlay,
            dialog: refundOverlay.querySelector('.refund-dialog'),
            closeButton: element('refund-close'),
            canCloseFromBackdrop: () => false,
            onClose: () => {
                this.pendingCancellationOrder = null;
            }
        });
    }

    _bindEvents() {
        element('refund-back').addEventListener('click', () => this.refundDialog.close());
        element('refund-confirm').addEventListener('click', () => this._confirmCancellation());
    }

    _createOrderCard(order) {
        const card = document.createElement('article');
        card.className = 'order-card';
        if (order.status === 'cancelled') card.classList.add('is-cancelled');
        const header = document.createElement('div');
        header.className = 'order-card-header';
        appendText(header, 'strong', order.movieSnapshot.title);
        const status = appendText(header, 'span', order.status === 'confirmed' ? '已确认' : '已取消');
        if (order.status === 'cancelled') status.classList.add('is-cancelled');
        card.append(header);
        const showtime = order.showtimeSnapshot.startsAt ?
            `${formatDate(order.showtimeSnapshot.startsAt, true)} ${formatTime(order.showtimeSnapshot.startsAt)}` :
            '历史场次时间未记录';
        appendText(card, 'p', `${showtime} · ${order.auditoriumSnapshot.name}`);
        const footer = document.createElement('div');
        footer.className = 'order-card-footer';
        appendText(footer, 'span', order.seatSnapshots.map(seat => seat.label).join('、'));
        appendText(footer, 'strong', formatMoney(order.pricingQuote.total));
        card.append(footer);
        const ticketCode = document.createElement('div');
        ticketCode.className = 'order-ticket-code';
        appendText(ticketCode, 'span', order.status === 'cancelled' ? '已失效取票码' : '电子取票码');
        appendText(ticketCode, 'strong', order.ticketCode);
        card.append(ticketCode);

        const timeline = document.createElement('ol');
        timeline.className = 'order-timeline';
        appendText(
            timeline,
            'li',
            `订单已确认 · ${formatDate(order.confirmedAt, true)} ${formatTime(order.confirmedAt)}`
        );
        if (order.status === 'cancelled') {
            const item = appendText(
                timeline,
                'li',
                `已取消，退款申请已提交 · ${formatDate(order.cancelledAt, true)} ${formatTime(order.cancelledAt)}`
            );
            item.className = 'is-refund';
        }
        card.append(timeline);
        appendText(card, 'p', order.refundPolicySnapshot.summary, 'order-policy');

        if (order.status === 'cancelled') {
            appendText(
                card,
                'span',
                `退款处理中：${formatMoney(order.refund.amount)}（手续费 ${formatMoney(order.refund.fee)}）`,
                'order-refund-state'
            );
            return card;
        }

        const user = this.account.getCurrentUser();
        const eligibility = user ? this.booking.getOrderCancellationEligibility({
            orderId: order.id,
            actorUserId: user.id
        }) : null;
        if (eligibility?.ok && eligibility.value.eligible) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'order-refund-action';
            action.textContent = `取消整单 · 预计退 ${formatMoney(eligibility.value.refundAmount)}`;
            action.addEventListener('click', () => this._openCancellation(order, action));
            card.append(action);
        } else if (eligibility?.ok) {
            appendText(card, 'span', eligibility.value.reason, 'order-refund-note');
        }
        return card;
    }

    _openCancellation(order, trigger) {
        const user = this.account.getCurrentUser();
        if (!user) return;
        const eligibility = this.booking.getOrderCancellationEligibility({
            orderId: order.id,
            actorUserId: user.id
        });
        if (!eligibility.ok || !eligibility.value.eligible) {
            this.onNotify(eligibility.error?.message || eligibility.value.reason);
            return;
        }
        this.pendingCancellationOrder = order;
        const content = element('refund-content');
        content.replaceChildren();
        appendText(
            content,
            'p',
            `${order.movieSnapshot.title} · ${order.seatSnapshots.map(seat => seat.label).join('、')}`,
            'dialog-intro'
        );
        const summary = document.createElement('div');
        summary.className = 'refund-summary';
        this._appendDetailRow(summary, '订单实付', formatMoney(order.pricingQuote.total));
        this._appendDetailRow(summary, '退票手续费', formatMoney(eligibility.value.fee));
        this._appendDetailRow(summary, '预计退款', formatMoney(eligibility.value.refundAmount));
        this._appendDetailRow(
            summary,
            '最晚申请',
            `${formatDate(eligibility.value.cutoffAt, true)} ${formatTime(eligibility.value.cutoffAt)}`
        );
        content.append(summary);
        appendText(
            content,
            'p',
            '取消后整单座位会立即释放，电子取票码失效；退款到账时间取决于原支付渠道。此操作不能在页面内撤销。',
            'refund-warning'
        );
        element('refund-confirm').disabled = false;
        this.refundDialog.open({ trigger, initialFocus: element('refund-confirm') });
    }

    _appendDetailRow(parent, label, value) {
        const row = document.createElement('div');
        appendText(row, 'span', label);
        appendText(row, 'strong', value);
        parent.append(row);
    }

    _confirmCancellation() {
        const user = this.account.getCurrentUser();
        const order = this.pendingCancellationOrder;
        if (!user || !order) return;
        const button = element('refund-confirm');
        button.disabled = true;
        const result = this.booking.cancelOrder({
            orderId: order.id,
            actorUserId: user.id
        });
        if (!result.ok) {
            button.disabled = false;
            this.onNotify(result.error.message);
            return;
        }
        const refundAmount = result.value.order.refund.amount;
        this.refundDialog.close({ restoreFocus: false });
        this.render(user.id);
        this.onInventoryChanged(result.value.order.showtimeSnapshot.id);
        requestAnimationFrame(() => element('orders-dialog').querySelector('.orders-dialog').focus());
        this.onNotify(`订单已取消，${formatMoney(refundAmount)} 退款申请已提交`);
        this.onAnnounce('订单已取消，座位已经释放，退款申请已提交');
    }
}

export default CommercialOrdersController;
