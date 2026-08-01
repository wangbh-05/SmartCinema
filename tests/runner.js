/**
 * 测试运行器
 * 运行所有测试并生成报告
 */

import TestTicketingDomain from './test-ticketing-domain.js';
import TestStateStorage from './test-state-storage.js';
import TestBookingService from './test-booking-service.js';
import TestTicketingComposition from './test-ticketing-composition.js';
import TestOperationsService from './test-operations-service.js';
import TestArchitectureBoundaries from './test-architecture-boundaries.js';
import TestSeatAdvisorController from './test-seat-advisor-controller.js';
import TestSeatMapController from './test-seat-map-controller.js';

class TestRunner {
    constructor() {
        this.results = [];
    }

    /**
     * 运行所有测试套件
     */
    async runAll() {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║     SmartCinema 自动化测试套件       ║');
        console.log('╚════════════════════════════════════════╝\n');

        // 当前购票领域：目录、票种、座位规则、价格、锁座与订单快照
        const ticketingDomainTest = new TestTicketingDomain();
        const ticketingDomainResult = ticketingDomainTest.runAll();
        this.results.push({ name: 'TicketingDomain', ...ticketingDomainResult });

        // 当前状态初始化、校验与 revision 并发控制
        const stateStorageTest = new TestStateStorage();
        const stateStorageResult = stateStorageTest.runAll();
        this.results.push({ name: 'StateStorage', ...stateStorageResult });

        // 应用用例：场次上下文、草稿、原子锁座、释放、过期与确认
        const bookingServiceTest = new TestBookingService();
        const bookingServiceResult = bookingServiceTest.runAll();
        this.results.push({ name: 'BookingService', ...bookingServiceResult });

        // 生产 composition root：状态初始化、演示库存、账户和推荐报价
        const ticketingCompositionTest = new TestTicketingComposition();
        const ticketingCompositionResult = ticketingCompositionTest.runAll();
        this.results.push({ name: 'TicketingComposition', ...ticketingCompositionResult });

        // 内部运维：权限、指标、锁座释放与安全恢复
        const operationsServiceTest = new TestOperationsService();
        const operationsServiceResult = operationsServiceTest.runAll();
        this.results.push({ name: 'OperationsService', ...operationsServiceResult });

        // 防止已退役 UI 链、跨入口依赖和浏览器全局重新污染分层
        const architectureTest = new TestArchitectureBoundaries();
        const architectureResult = architectureTest.runAll();
        this.results.push({ name: 'ArchitectureBoundaries', ...architectureResult });

        // Canvas 座位图触摸点按与滑动手势边界
        const seatMapControllerTest = new TestSeatMapController();
        const seatMapControllerResult = seatMapControllerTest.runAll();
        this.results.push({ name: 'SeatMapController', ...seatMapControllerResult });

        // 智能选座请求取消后的交互状态恢复
        const seatAdvisorControllerTest = new TestSeatAdvisorController();
        const seatAdvisorControllerResult = seatAdvisorControllerTest.runAll();
        this.results.push({ name: 'SeatAdvisorController', ...seatAdvisorControllerResult });

        // 打印总摘要
        this.printGlobalSummary();

        return this.getGlobalSummary();
    }

    getGlobalSummary() {
        let totalPassed = 0;
        let totalFailed = 0;
        let totalTests = 0;
        let expectedFailures = 0;

        this.results.forEach(result => {
            totalPassed += result.passed;
            totalFailed += result.failed;
            totalTests += result.total;
            expectedFailures += result.expectedFailures || 0;
        });

        return {
            passed: totalPassed,
            failed: totalFailed,
            total: totalTests,
            expectedFailures,
            successRate: totalTests === 0 ? 0 : Number(((totalPassed / totalTests) * 100).toFixed(1))
        };
    }

    /**
     * 打印全局摘要
     */
    printGlobalSummary() {
        let totalPassed = 0;
        let totalFailed = 0;
        let totalTests = 0;
        let expectedFailures = 0;

        this.results.forEach(result => {
            totalPassed += result.passed;
            totalFailed += result.failed;
            totalTests += result.total;
            expectedFailures += result.expectedFailures || 0;
        });

        const rate = totalTests === 0 ? '0.0' : ((totalPassed / totalTests) * 100).toFixed(1);

        console.log('\n╔════════════════════════════════════════╗');
        console.log('║           全局测试摘要                 ║');
        console.log('╚════════════════════════════════════════╝\n');

        this.results.forEach(result => {
            const status = result.failed === 0 ? '✓' : '✗';
            const known = result.expectedFailures ? ` | XFAIL ${result.expectedFailures}` : '';
            console.log(`${status} ${result.name.padEnd(20)}: ${result.passed}/${result.total}${known}`);
        });

        console.log('\n' + '─'.repeat(40));
        console.log(`总计: ${totalTests} | 通过: ${totalPassed} | 失败: ${totalFailed}`);
        console.log(`已知缺陷稳定复现: ${expectedFailures}`);
        console.log(`成功率: ${rate}%`);
        console.log('─'.repeat(40) + '\n');

        if (totalFailed === 0 && expectedFailures > 0) {
            console.log(`✓ 所有非预期失败测试通过；${expectedFailures} 个已知缺陷保持 XFAIL。\n`);
        } else if (totalFailed === 0) {
            console.log('🎉 所有测试通过！\n');
        } else {
            console.log(`⚠️  ${totalFailed} 个测试失败，请检查\n`);
        }
    }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new TestRunner();
    runner.runAll().then(summary => {
        if (summary.failed > 0) process.exitCode = 1;
    });
}

export default TestRunner;
