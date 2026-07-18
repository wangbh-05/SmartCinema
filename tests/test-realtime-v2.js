import { createBrowserAppController } from '../src/bootstrap.js';
import { RealtimeEventSimulator } from '../src/infrastructure/realtime/RealtimeEventSimulator.js';

const NOW = '2026-07-18T00:00:00.000Z';

class MemoryWebStorage {
    constructor() {
        this.data = new Map();
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
    }
}

class TestScheduler {
    constructor() {
        this.sequence = 0;
        this.tasks = new Map();
    }

    setTimeout(fn, delay) {
        const id = ++this.sequence;
        this.tasks.set(id, { fn, delay });
        return id;
    }

    clearTimeout(id) {
        this.tasks.delete(id);
    }

    runFirst() {
        const entry = this.tasks.entries().next().value;
        if (!entry) return;
        const [id, task] = entry;
        this.tasks.delete(id);
        task.fn();
    }
}

function sequenceRandom(values) {
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)];
}

class TestRealtimeV2 {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✓ ${name}`);
        } catch (error) {
            this.failed++;
            console.error(`✗ ${name}`, error.message);
        }
    }

    assertEqual(actual, expected) {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    runAll() {
        console.log('\n========== Realtime v2 测试 ==========\n');

        this.test('hold 事件应只发消息并在到期后 release', () => {
            const scheduler = new TestScheduler();
            const events = [];
            const simulator = new RealtimeEventSimulator({
                getContext: () => ({
                    showtimeId: 'medium:day:3',
                    availableSeatKeys: ['5-8']
                }),
                onEvent: event => events.push(event),
                clock: { now: () => NOW },
                idGenerator: { next: () => 'remote-1' },
                random: sequenceRandom([0, 0, 0.9, 0]),
                scheduler
            });
            const event = simulator._tick();
            this.assertEqual(event.type, 'hold');
            this.assertEqual(events.length, 1);
            scheduler.runFirst();
            this.assertEqual(events[1].type, 'release');
            this.assertEqual(events[1].seatKey, '5-8');
        });

        this.test('purchase 事件应包含场次且不需要 SeatData', () => {
            const events = [];
            const simulator = new RealtimeEventSimulator({
                getContext: () => ({
                    showtimeId: 'small:day:0',
                    availableSeatKeys: ['1-1']
                }),
                onEvent: event => events.push(event),
                clock: { now: () => NOW },
                idGenerator: { next: () => 'remote-2' },
                random: sequenceRandom([0, 0, 0.1]),
                scheduler: new TestScheduler()
            });
            const event = simulator._tick();
            this.assertEqual(event.type, 'purchase');
            this.assertEqual(event.showtimeId, 'small:day:0');
            this.assertEqual(events[0].seatKey, '1-1');
        });

        this.test('远端 purchase 应通过 repository 写入对应场次库存且保持幂等', () => {
            let sequence = 0;
            const controller = createBrowserAppController({
                localStorage: new MemoryWebStorage(),
                sessionStorage: new MemoryWebStorage(),
                clock: { now: () => NOW },
                idGenerator: { next: prefix => `${prefix}-${++sequence}` }
            });
            controller.initialize('medium:day:3');
            const first = controller.applyRemotePurchase({
                showtimeId: 'medium:day:3',
                seatKey: '5-8'
            });
            const second = controller.applyRemotePurchase({
                showtimeId: 'medium:day:3',
                seatKey: '5-8'
            });
            this.assertTrue(first.ok);
            this.assertTrue(second.value.duplicate);
            this.assertEqual(controller.getState().inventory.soldSeatKeys.length, 1);
        });

        return this.printSummary();
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestRealtimeV2;
