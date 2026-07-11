/**
 * RealtimeSimulator — 模拟 WebSocket 实时座位更新
 *
 * 在没有真实后端的情况下，使用定时器模拟多用户并发选座/购票场景。
 * 效果：其他用户随机选座/购票 → toast通知 → 座位图实时更新。
 */

import { SEAT_STATUS } from '../core/SeatData.js';

export class RealtimeSimulator {
    constructor(seatData, cinema, options = {}) {
        this.sd = seatData;
        this.cinema = cinema;
        this.running = false;
        this.timer = null;
        this.interval = options.interval || 5000;  // 默认5秒一次事件
        this.onEvent = options.onEvent || null;     // 回调: (event) => void
        this.userNames = ['观众A', '观众B', '观众C', '观众D', '观众E', '观众F'];
        this.eventCount = 0;
        this.maxEvents = options.maxEvents || 0;  // 0=无限
    }

    /** 启动模拟 */
    start() {
        if (this.running) return;
        this.running = true;
        this._schedule();
        console.log('[RealtimeSimulator] 已启动，间隔', this.interval, 'ms');
    }

    /** 停止模拟 */
    stop() {
        this.running = false;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        console.log('[RealtimeSimulator] 已停止');
    }

    _schedule() {
        if (!this.running) return;
        this.timer = setTimeout(() => {
            this._tick();
            if (this.maxEvents > 0 && this.eventCount >= this.maxEvents) {
                this.stop();
                return;
            }
            this._schedule();
        }, this.interval + Math.random() * 3000);  // 间隔加随机抖动
    }

    /** 执行一次随机事件 */
    _tick() {
        const { rows, cols } = this.sd;
        const stats = this.sd.getStats();
        if (stats.available === 0) return;  // 无空座

        // 随机选一个空座
        let row, col, seat;
        let attempts = 0;
        do {
            row = Math.floor(Math.random() * rows);
            col = Math.floor(Math.random() * cols);
            seat = this.sd.getSeat(row, col);
            attempts++;
        } while ((!seat || seat.status !== SEAT_STATUS.AVAILABLE || seat.isSelected) && attempts < 200);

        if (!seat || seat.status !== SEAT_STATUS.AVAILABLE || seat.isSelected) return;

        // 随机事件类型：70%概率其他用户选座后又取消，30%概率直接购票
        const isPurchase = Math.random() < 0.3;
        const userName = this.userNames[Math.floor(Math.random() * this.userNames.length)];
        const posLabel = `${row + 1}排${col + 1}座`;

        let event;
        if (isPurchase) {
            // 模拟其他用户购票
            seat.status = SEAT_STATUS.OCCUPIED;
            event = { type: 'purchase', row, col, userName, posLabel, time: Date.now() };
        } else {
            // 模拟其他用户短暂选座后取消（闪烁效果）
            // 先标记为selected
            const wasSelected = seat.isSelected;
            seat.isSelected = true;
            this.sd.selectedSeats.add(`${row}-${col}`);

            event = { type: 'select', row, col, userName, posLabel, time: Date.now() };

            // 1-3秒后自动取消
            setTimeout(() => {
                const s = this.sd.getSeat(row, col);
                if (s && s.isSelected && s.status === SEAT_STATUS.AVAILABLE && !wasSelected) {
                    s.isSelected = false;
                    this.sd.selectedSeats.delete(`${row}-${col}`);
                    this.cinema.redraw();
                }
            }, 1000 + Math.random() * 2000);
        }

        this.eventCount++;
        this.cinema.redraw();

        // 回调通知
        if (this.onEvent) {
            this.onEvent(event);
        }

        // 触发UI更新
        this.cinema._emit();
    }
}

export default RealtimeSimulator;
