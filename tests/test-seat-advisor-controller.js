import { SeatAdvisorController } from '../src/ui/controllers/SeatAdvisorController.js';

export default class TestSeatAdvisorController {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    runAll() {
        console.log('\n========== Seat Advisor Controller 测试 ==========\n');

        try {
            const controller = Object.create(SeatAdvisorController.prototype);
            let aborted = false;
            controller.busy = true;
            controller.abortController = {
                abort() {
                    aborted = true;
                }
            };

            controller._abort();

            if (!aborted) throw new Error('Expected the active request to be aborted');
            if (controller.abortController !== null) {
                throw new Error('Expected abortController to be cleared');
            }
            if (controller.busy !== false) throw new Error('Expected busy state to be cleared');
            this.passed++;
            console.log('✓ 关闭请求后应恢复可提交状态');
        } catch (error) {
            this.failed++;
            console.error('✗ 关闭请求后应恢复可提交状态', error.message);
        }

        return {
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed
        };
    }
}
