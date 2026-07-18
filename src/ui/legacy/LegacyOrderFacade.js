import { parseShowtimeId } from '../../domain/cinema/Showtime.js';

const HALL_NAMES = Object.freeze({
    small: '小厅',
    medium: '中厅',
    large: '大厅'
});

function toLegacyOrder(order) {
    const showtime = parseShowtimeId(order.showtimeId);
    return {
        id: order.id,
        timestamp: order.createdAt,
        status: order.status,
        seats: order.seats.map(seat => ({
            row: seat.row,
            col: seat.col,
            price: seat.unitPrice
        })),
        seatKeys: order.seats.map(seat => seat.seatKey),
        seatCount: order.seats.length,
        totalPrice: order.totalPrice,
        hallType: showtime.hallType,
        hallName: HALL_NAMES[showtime.hallType],
        dayIndex: showtime.dayIndex,
        userId: order.userId,
        refundAmount: order.refund?.amount || null,
        refundStatus: order.refund?.status || null,
        cancelReason: order.cancelReason,
        cancelTime: order.cancelledAt
    };
}

/**
 * 迁移期订单 facade。
 *
 * 负责把 v2 订单投影成旧视图需要的字段，但不创建第二份订单状态。
 */
export class LegacyOrderFacade {
    constructor(controller) {
        this.controller = controller;
    }

    getOrders(filter = {}) {
        const scope = this.controller.isAdmin() ? 'all' : 'mine';
        const result = this.controller.listOrders({ scope });
        if (!result.ok) return [];
        let orders = result.value.map(toLegacyOrder);
        if (filter.status) orders = orders.filter(order => order.status === filter.status);
        if (filter.startDate) {
            const start = Date.parse(filter.startDate);
            orders = orders.filter(order => Date.parse(order.timestamp) >= start);
        }
        if (filter.endDate) {
            const end = Date.parse(filter.endDate);
            orders = orders.filter(order => Date.parse(order.timestamp) <= end);
        }
        if (filter.sort === 'oldest') {
            orders.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
        } else {
            orders.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
        }
        return orders;
    }

    getOrder(orderId) {
        return this.getOrders().find(order => order.id === orderId) || null;
    }

    cancelOrder(orderId, reason = '') {
        const result = this.controller.cancelOrder(orderId, reason);
        if (!result.ok) {
            return {
                success: false,
                message: result.error.message,
                code: result.error.code
            };
        }
        return {
            success: true,
            message: '订单已取消',
            order: toLegacyOrder(result.value.order)
        };
    }

    getStatistics() {
        const orders = this.getOrders();
        const confirmed = orders.filter(order => order.status === 'confirmed');
        const totalRevenue = confirmed.reduce((sum, order) => sum + order.totalPrice, 0);
        return {
            totalOrders: orders.length,
            confirmedOrders: confirmed.length,
            pendingOrders: 0,
            cancelledOrders: orders.filter(order => order.status === 'cancelled').length,
            totalRevenue,
            averageOrderValue: confirmed.length > 0 ? (totalRevenue / confirmed.length).toFixed(2) : 0,
            totalSeatsBooked: orders.reduce((sum, order) => sum + order.seatCount, 0)
        };
    }

    generateReceipt(orderId) {
        const order = this.getOrder(orderId);
        if (!order) return null;
        const seats = order.seats
            .map(seat => `${seat.row + 1}排${seat.col + 1}座`)
            .join('、');
        return [
            'SmartCinema 订单收据',
            `订单号: ${order.id}`,
            `状态: ${this.getStatusText(order.status)}`,
            `放映厅: ${order.hallName} · 周${order.dayIndex + 1}`,
            `座位: ${seats}`,
            `数量: ${order.seatCount} 张`,
            `总价: ¥${order.totalPrice}`
        ].join('\n');
    }

    getStatusText(status) {
        return {
            confirmed: '已确认',
            cancelled: '已取消'
        }[status] || status;
    }
}

export default LegacyOrderFacade;
