import { addMilliseconds } from '../../shared/time.js';

/**
 * 仅产生模拟远端事件，不读取或修改 SeatData、Canvas 或应用状态。
 */
export class RealtimeEventSimulator {
    constructor({
        getContext,
        onEvent,
        clock,
        idGenerator,
        random = Math.random,
        scheduler = globalThis,
        interval = 5000,
        jitter = 3000,
        maxEvents = 0
    }) {
        if (typeof getContext !== 'function' || typeof onEvent !== 'function') {
            throw new TypeError('RealtimeEventSimulator 需要 getContext/onEvent');
        }
        if (!clock || typeof clock.now !== 'function') throw new TypeError('RealtimeEventSimulator 需要 Clock');
        if (!idGenerator || typeof idGenerator.next !== 'function') {
            throw new TypeError('RealtimeEventSimulator 需要 IdGenerator');
        }
        if (typeof scheduler.setTimeout !== 'function' || typeof scheduler.clearTimeout !== 'function') {
            throw new TypeError('RealtimeEventSimulator 需要 timer scheduler');
        }
        this.getContext = getContext;
        this.onEvent = onEvent;
        this.clock = clock;
        this.idGenerator = idGenerator;
        this.random = random;
        this.scheduler = scheduler;
        this.interval = interval;
        this.jitter = jitter;
        this.maxEvents = maxEvents;
        this.userNames = ['观众A', '观众B', '观众C', '观众D', '观众E', '观众F'];
        this.running = false;
        this.eventCount = 0;
        this.timer = null;
        this.releaseTimers = new Map();
        this.activeHolds = new Map();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._schedule();
    }

    stop() {
        this.running = false;
        if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
        this.timer = null;
        this.releaseTimers.forEach(timer => this.scheduler.clearTimeout(timer));
        this.releaseTimers.clear();
        this.activeHolds.forEach(event => {
            this.onEvent({
                type: 'release',
                id: event.id,
                showtimeId: event.showtimeId,
                seatKey: event.seatKey
            });
        });
        this.activeHolds.clear();
    }

    _schedule() {
        if (!this.running) return;
        const delay = this.interval + Math.floor(this.random() * this.jitter);
        this.timer = this.scheduler.setTimeout(() => {
            this.timer = null;
            this._tick();
            if (this.maxEvents > 0 && this.eventCount >= this.maxEvents) {
                this.stop();
                return;
            }
            this._schedule();
        }, delay);
    }

    _tick() {
        const context = this.getContext();
        const candidates = Array.isArray(context?.availableSeatKeys) ? context.availableSeatKeys : [];
        if (typeof context?.showtimeId !== 'string' || candidates.length === 0) return null;

        const seatKey = candidates[Math.floor(this.random() * candidates.length)];
        const ownerLabel = this.userNames[Math.floor(this.random() * this.userNames.length)];
        const now = this.clock.now();
        const id = this.idGenerator.next('remote');
        const purchase = this.random() < 0.3;
        this.eventCount++;

        if (purchase) {
            const event = {
                type: 'purchase',
                id,
                showtimeId: context.showtimeId,
                seatKey,
                ownerLabel,
                occurredAt: now
            };
            this.onEvent(event);
            return event;
        }

        const holdMilliseconds = 1000 + Math.floor(this.random() * 2000);
        const event = {
            type: 'hold',
            id,
            showtimeId: context.showtimeId,
            seatKey,
            ownerLabel,
            expiresAt: addMilliseconds(now, holdMilliseconds)
        };
        this.activeHolds.set(id, event);
        this.onEvent(event);
        const timer = this.scheduler.setTimeout(() => {
            this.releaseTimers.delete(id);
            if (!this.activeHolds.has(id)) return;
            this.activeHolds.delete(id);
            this.onEvent({
                type: 'release',
                id,
                showtimeId: event.showtimeId,
                seatKey
            });
        }, holdMilliseconds);
        this.releaseTimers.set(id, timer);
        return event;
    }
}

export default RealtimeEventSimulator;
