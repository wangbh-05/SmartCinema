export class OrdersPanelController {
    constructor({
        orderManager,
        document,
        confirmAction,
        notify,
        onCancelled,
        onAnnounce
    }) {
        if (!orderManager || !document) throw new TypeError('OrdersPanelController 缺少必要依赖');
        this.orderManager = orderManager;
        this.document = document;
        this.confirmAction = confirmAction;
        this.notify = notify;
        this.onCancelled = onCancelled;
        this.onAnnounce = onAnnounce;
        this.container = document.getElementById('orders-mini-list');
        this.summary = document.getElementById('order-summary-mini');
        this.submitButton = document.getElementById('btn-submit-order');
        this.toggleButton = document.getElementById('btn-view-orders');
        this.bound = false;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        this.toggleButton?.addEventListener('click', () => this.toggle());
    }

    updateCheckoutSummary(selectedSeats, loggedIn) {
        if (!this.summary || !this.submitButton) return;
        if (selectedSeats.length === 0) {
            this.summary.textContent = '暂未选择座位';
            this.submitButton.disabled = true;
            this.submitButton.textContent = '提交订单';
            return;
        }
        const total = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
        this.summary.textContent = `已选 ${selectedSeats.length} 座 · 合计 ¥${total}`;
        this.submitButton.disabled = !loggedIn;
        this.submitButton.textContent = loggedIn ? `提交订单 · ¥${total}` : '请先登录';
    }

    toggle() {
        if (!this.container) return;
        this.container.hidden = !this.container.hidden;
        if (!this.container.hidden) this.render();
    }

    render() {
        if (!this.container) return;
        const orders = this.orderManager.getOrders({ sort: 'newest' });
        const stats = this.orderManager.getStatistics();
        this.container.replaceChildren();
        if (orders.length === 0) {
            this.container.appendChild(this._element('p', 'orders-mini-empty', '暂无订单'));
            return;
        }

        this.container.appendChild(this._element(
            'div',
            'orders-mini-stats',
            `共${stats.totalOrders}单 · 已确认${stats.confirmedOrders} · 收入¥${stats.totalRevenue}`
        ));
        orders.slice(0, 5).forEach(order => this.container.appendChild(this._orderCard(order)));
        if (orders.length > 5) {
            this.container.appendChild(this._element(
                'p',
                'orders-mini-more',
                `还有 ${orders.length - 5} 单…`
            ));
        }
    }

    cancel(orderId) {
        const order = this.orderManager.getOrder(orderId);
        if (!order) {
            this.notify?.('订单不存在');
            return false;
        }
        const action = order.status === 'confirmed' ? '退票' : '取消订单';
        if (!this.confirmAction?.(`确定要${action}吗？`)) return false;
        const result = this.orderManager.cancelOrder(orderId, action);
        if (!result.success) {
            this.notify?.(result.message);
            return false;
        }
        this.onCancelled?.(order, action);
        this.render();
        this.onAnnounce?.(`${action}成功`);
        return true;
    }

    showReceipt(orderId) {
        const receipt = this.orderManager.generateReceipt(orderId);
        if (!receipt) {
            this.notify?.('订单不存在');
            return false;
        }
        this.notify?.(receipt);
        return true;
    }

    _orderCard(order) {
        const card = this._element('article', `order-card status-${order.status} orders-mini-card`);
        const header = this._element('div', 'order-header-row');
        header.appendChild(this._element('span', 'order-id', order.id));
        header.appendChild(this._element(
            'span',
            'order-status-badge',
            this.orderManager.getStatusText(order.status)
        ));
        card.appendChild(header);

        const seats = order.seats.map(seat => `${seat.row + 1}排${seat.col + 1}座`).join(' ');
        const hall = order.hallName ? `${order.hallName} · ` : '';
        card.appendChild(this._element('div', 'orders-mini-detail', `${hall}${seats} | ¥${order.totalPrice}`));

        const actions = this._element('div', 'order-actions-row');
        actions.appendChild(this._button('收据', () => this.showReceipt(order.id)));
        if (order.status === 'confirmed' || order.status === 'pending') {
            const label = order.status === 'confirmed' ? '退票' : '取消';
            actions.appendChild(this._button(label, () => this.cancel(order.id), true));
        }
        card.appendChild(actions);
        return card;
    }

    _button(label, onClick, danger = false) {
        const button = this._element('button', `btn btn-sm${danger ? ' btn-danger' : ''}`, label);
        button.type = 'button';
        button.addEventListener('click', onClick);
        return button;
    }

    _element(tagName, className, text = '') {
        const element = this.document.createElement(tagName);
        element.className = className;
        element.textContent = text;
        return element;
    }
}

export default OrdersPanelController;
