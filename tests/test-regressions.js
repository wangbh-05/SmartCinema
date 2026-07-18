/**
 * 已知缺陷契约测试
 *
 * 这些测试使用 XFAIL 固定修复前必然违反的目标契约。只有契约断言失败才算
 * “已复现”；测试准备错误会计为失败，契约意外通过也会要求维护者把它转成
 * 普通回归测试，避免修复悄悄失去保护。
 */

import { OrderManager } from '../src/modules/OrderManager.js';
import { RealtimeSimulator } from '../src/modules/RealtimeSimulator.js';

class ContractFailure extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContractFailure';
    }
}

class MemoryStorage {
    constructor() {
        this.data = {};
    }

    loadOrders() {
        return this.data.orders || [];
    }

    save(key, value) {
        this.data[key] = value;
        return true;
    }
}

class TestRegressionContracts {
    constructor() {
        this.expectedFailures = 0;
        this.failed = 0;
    }

    assertContract(condition, message) {
        if (!condition) {
            throw new ContractFailure(message);
        }
    }

    xfail(id, name, fn) {
        try {
            fn();
            this.failed++;
            console.error(`✗ XPASS ${id} ${name}：目标契约已通过，请转为普通回归测试`);
        } catch (error) {
            if (error instanceof ContractFailure) {
                this.expectedFailures++;
                console.log(`⊘ XFAIL ${id} ${name}：${error.message}`);
                return;
            }

            this.failed++;
            console.error(`✗ ERROR ${id} ${name}：${error.message}`);
        }
    }

    runAll() {
        console.log('\n========== 已知缺陷契约测试 ==========\n');

        this.xfail('BUG-002', '订单必须按稳定 userId 隔离', () => {
            const manager = new OrderManager(new MemoryStorage());
            const seats = [{ row: 5, col: 5, price: 100 }];

            manager.createOrder(seats, {
                userId: 'user-a',
                name: '用户 A'
            });
            manager.createOrder(seats, {
                userId: 'user-b',
                name: '用户 B'
            });

            const userAOrders = manager.getOrders({ userId: 'user-a' });
            this.assertContract(
                userAOrders.length === 1 && userAOrders[0].userId === 'user-a',
                `查询 user-a 得到 ${userAOrders.length} 个订单，且订单没有稳定 userId`
            );
        });

        this.xfail('BUG-004', '远端临时占座不得写入本地选择', () => {
            const seat = {
                row: 0,
                col: 0,
                status: 'available',
                isSelected: false
            };
            const seatData = {
                rows: 1,
                cols: 1,
                selectedSeats: new Set(),
                getStats: () => ({ available: 1 }),
                getSeat: () => seat
            };
            const cinema = {
                redraw() {},
                _emit() {}
            };
            const simulator = new RealtimeSimulator(seatData, cinema);
            const originalRandom = Math.random;
            const originalSetTimeout = globalThis.setTimeout;

            try {
                Math.random = () => 0.9;
                globalThis.setTimeout = () => 0;
                simulator._tick();
            } finally {
                Math.random = originalRandom;
                globalThis.setTimeout = originalSetTimeout;
            }

            this.assertContract(
                seatData.selectedSeats.size === 0 && seat.isSelected === false,
                '远端 select 事件直接修改了 selectedSeats/isSelected'
            );
        });

        console.log('\n========== 已知缺陷摘要 ==========');
        console.log(`稳定复现: ${this.expectedFailures} | 异常/意外通过: ${this.failed}\n`);

        return {
            passed: 0,
            failed: this.failed,
            total: this.failed,
            expectedFailures: this.expectedFailures
        };
    }
}

export default TestRegressionContracts;
