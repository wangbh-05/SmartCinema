/**
 * OrderManager - 订单中心管理
 * 负责订单的创建、更新、查询、删除
 */

export class OrderManager {
    constructor(storage) {
        this.storage = storage;
        this.orders = this.loadOrders();
    }

    /**
     * 创建新订单
     */
    createOrder(seats, userInfo = {}) {
        if (!seats || seats.length === 0) {
            return {
                success: false,
                message: '必须选择至少一个座位'
            };
        }

        const order = {
            id: this.generateOrderId(),
            timestamp: new Date().toISOString(),
            status: 'pending', // pending, confirmed, cancelled
            seats: seats.map(seat => ({
                row: seat.row,
                col: seat.col,
                price: seat.price
            })),
            totalPrice: seats.reduce((sum, s) => sum + s.price, 0),
            seatCount: seats.length,
            userInfo: {
                name: userInfo.name || '匿名用户',
                phone: userInfo.phone || '',
                email: userInfo.email || ''
            },
            paymentMethod: userInfo.paymentMethod || 'credit_card',
            paymentTime: null,
            confirmTime: null
        };

        this.orders.push(order);
        this.save();

        return {
            success: true,
            order: order
        };
    }

    /**
     * 确认订单（支付）
     */
    confirmOrder(orderId) {
        const order = this.getOrder(orderId);
        if (!order) {
            return { success: false, message: '订单不存在' };
        }

        if (order.status !== 'pending') {
            return { success: false, message: '订单状态无法确认' };
        }

        order.status = 'confirmed';
        order.confirmTime = new Date().toISOString();
        this.save();

        return {
            success: true,
            message: '订单已确认',
            order: order
        };
    }

    /**
     * 取消订单
     */
    cancelOrder(orderId, reason = '') {
        const order = this.getOrder(orderId);
        if (!order) {
            return { success: false, message: '订单不存在' };
        }

        if (order.status === 'confirmed') {
            order.refundAmount = order.totalPrice;
            order.refundStatus = 'pending';
        }

        order.status = 'cancelled';
        order.cancelReason = reason;
        order.cancelTime = new Date().toISOString();
        this.save();

        return {
            success: true,
            message: '订单已取消',
            order: order
        };
    }

    /**
     * 获取订单
     */
    getOrder(orderId) {
        return this.orders.find(o => o.id === orderId);
    }

    /**
     * 获取所有订单
     */
    getOrders(filter = {}) {
        let filtered = [...this.orders];

        if (filter.status) {
            filtered = filtered.filter(o => o.status === filter.status);
        }

        if (filter.startDate) {
            filtered = filtered.filter(o => new Date(o.timestamp) >= new Date(filter.startDate));
        }

        if (filter.endDate) {
            filtered = filtered.filter(o => new Date(o.timestamp) <= new Date(filter.endDate));
        }

        if (filter.sort === 'newest') {
            filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else if (filter.sort === 'oldest') {
            filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        }

        return filtered;
    }

    /**
     * 获取统计信息
     */
    getStatistics() {
        const stats = {
            totalOrders: this.orders.length,
            confirmedOrders: 0,
            pendingOrders: 0,
            cancelledOrders: 0,
            totalRevenue: 0,
            averageOrderValue: 0,
            totalSeatsBooked: 0
        };

        this.orders.forEach(order => {
            stats.totalSeatsBooked += order.seatCount;

            if (order.status === 'confirmed') {
                stats.confirmedOrders++;
                stats.totalRevenue += order.totalPrice;
            } else if (order.status === 'pending') {
                stats.pendingOrders++;
            } else if (order.status === 'cancelled') {
                stats.cancelledOrders++;
            }
        });

        if (stats.confirmedOrders > 0) {
            stats.averageOrderValue = (stats.totalRevenue / stats.confirmedOrders).toFixed(2);
        }

        return stats;
    }

    /**
     * 生成订单 ID
     */
    generateOrderId() {
        return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 加载订单
     */
    loadOrders() {
        return this.storage.loadOrders() || [];
    }

    /**
     * 保存订单
     */
    save() {
        this.storage.save('orders', this.orders);
    }

    /**
     * 导出订单为 CSV
     */
    exportToCSV() {
        const headers = ['订单号', '状态', '座位数', '总价', '时间', '用户名'];
        const rows = this.orders.map(o => [
            o.id,
            o.status,
            o.seatCount,
            o.totalPrice,
            new Date(o.timestamp).toLocaleDateString('zh-CN'),
            o.userInfo.name
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        return csv;
    }

    /**
     * 获取订单收据
     */
    generateReceipt(orderId) {
        const order = this.getOrder(orderId);
        if (!order) return null;

        const seatInfo = order.seats
            .map(s => `${String.fromCharCode(65 + s.row)}${s.col + 1}`)
            .join(', ');

        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     SmartCinema 订单收据
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

订单号: ${order.id}
状态: ${this.getStatusText(order.status)}
创建时间: ${new Date(order.timestamp).toLocaleString('zh-CN')}

用户信息:
  姓名: ${order.userInfo.name}
  电话: ${order.userInfo.phone || '未提供'}
  邮箱: ${order.userInfo.email || '未提供'}

座位信息:
  座位: ${seatInfo}
  数量: ${order.seatCount} 张
  总价: ¥${order.totalPrice}

支付方式: ${this.getPaymentMethodText(order.paymentMethod)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
感谢您的购票！祝您观影愉快！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `;
    }

    /**
     * 获取状态文本
     */
    getStatusText(status) {
        const statusMap = {
            pending: '待确认',
            confirmed: '已确认',
            cancelled: '已取消'
        };
        return statusMap[status] || status;
    }

    /**
     * 获取支付方式文本
     */
    getPaymentMethodText(method) {
        const methodMap = {
            credit_card: '信用卡',
            debit_card: '借记卡',
            wechat: '微信支付',
            alipay: '支付宝',
            cash: '现金'
        };
        return methodMap[method] || method;
    }
}

export default OrderManager;
