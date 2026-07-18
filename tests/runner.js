/**
 * 测试运行器
 * 运行所有测试并生成报告
 */

import TestSeatData from './test-seatdata.js';
import TestRecommendUseCase from './test-recommend.js';
import TestScoreUseCase from './test-score.js';
import TestDomainContracts from './test-domain-contracts.js';
import TestStorageV2 from './test-storage-v2.js';
import TestStateBackup from './test-state-backup.js';
import TestMigrationV2 from './test-migration-v2.js';
import TestApplicationV2 from './test-application-v2.js';
import TestDerivedState from './test-derived-state.js';
import TestAppController from './test-app-controller.js';
import TestUiControllers from './test-ui-controllers.js';
import TestCanvasInteraction from './test-canvas-interaction.js';
import TestViewAdapters from './test-view-adapters.js';
import TestRealtimeV2 from './test-realtime-v2.js';
import TestRegressionContracts from './test-regressions.js';
import TestCommercialDomain from './test-commercial-domain.js';
import TestStorageV3 from './test-storage-v3.js';
import TestCommercialApplication from './test-commercial-application.js';
import TestCommercialComposition from './test-commercial-composition.js';
import TestCommercialOperations from './test-commercial-operations.js';

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

        // 运行 SeatData 测试
        const seatDataTest = new TestSeatData();
        const seatDataResult = seatDataTest.runAll();
        this.results.push({ name: 'SeatData', ...seatDataResult });

        // 推荐用例与 SeatData 视图适配器
        const recommendTest = new TestRecommendUseCase();
        const recommendResult = recommendTest.runAll();
        this.results.push({ name: 'Recommendation', ...recommendResult });

        // 评分用例与 SeatData 视图适配器
        const scoreTest = new TestScoreUseCase();
        const scoreResult = scoreTest.runAll();
        this.results.push({ name: 'Scoring', ...scoreResult });

        // v2 纯领域模型与状态转换
        const domainTest = new TestDomainContracts();
        const domainResult = domainTest.runAll();
        this.results.push({ name: 'DomainContracts', ...domainResult });

        // Storage v2 validator、revision repository 与 CheckoutIntent
        const storageV2Test = new TestStorageV2();
        const storageV2Result = storageV2Test.runAll();
        this.results.push({ name: 'StorageV2', ...storageV2Result });

        // Storage v2 安全导入/导出与回滚协议
        const stateBackupTest = new TestStateBackup();
        const stateBackupResult = stateBackupTest.runAll();
        this.results.push({ name: 'StateBackup', ...stateBackupResult });

        // v1 备份、校验、quarantine 与 v2 提交
        const migrationV2Test = new TestMigrationV2();
        const migrationV2Result = migrationV2Test.runAll();
        this.results.push({ name: 'MigrationV2', ...migrationV2Result });

        // Auth、Selection、Booking、Settings 应用用例
        const applicationV2Test = new TestApplicationV2();
        const applicationV2Result = applicationV2Test.runAll();
        this.results.push({ name: 'ApplicationV2', ...applicationV2Result });

        // 推荐、评分纯用例与 AppState 派生失效规则
        const derivedStateTest = new TestDerivedState();
        const derivedStateResult = derivedStateTest.runAll();
        this.results.push({ name: 'DerivedState', ...derivedStateResult });

        // Composition root 与统一 AppController
        const appControllerTest = new TestAppController();
        const appControllerResult = appControllerTest.runAll();
        this.results.push({ name: 'AppController', ...appControllerResult });

        // 设置、订单面板和通知的 DOM 协调边界
        const uiControllersTest = new TestUiControllers();
        const uiControllersResult = uiControllersTest.runAll();
        this.results.push({ name: 'UiControllers', ...uiControllersResult });

        // Canvas 纯布局、Pointer capture 与键盘输入状态机
        const canvasInteractionTest = new TestCanvasInteraction();
        const canvasInteractionResult = canvasInteractionTest.runAll();
        this.results.push({ name: 'CanvasInteraction', ...canvasInteractionResult });

        // 认证与订单视图适配器，不得创建第二份业务状态
        const viewAdaptersTest = new TestViewAdapters();
        const viewAdaptersResult = viewAdaptersTest.runAll();
        this.results.push({ name: 'ViewAdapters', ...viewAdaptersResult });

        // 无 SeatData/Canvas 副作用的 realtime event adapter
        const realtimeV2Test = new TestRealtimeV2();
        const realtimeV2Result = realtimeV2Test.runAll();
        this.results.push({ name: 'RealtimeV2', ...realtimeV2Result });

        // 已知缺陷契约：修复前稳定 XFAIL，异常或意外通过会计为失败
        const regressionTest = new TestRegressionContracts();
        const regressionResult = regressionTest.runAll();
        this.results.push({ name: 'RegressionContracts', ...regressionResult });

        // 商业购票 v3：目录、票种、座位规则、价格、锁座与订单快照
        const commercialDomainTest = new TestCommercialDomain();
        const commercialDomainResult = commercialDomainTest.runAll();
        this.results.push({ name: 'CommercialDomain', ...commercialDomainResult });

        // Storage v3 校验、revision 与冻结 v2 fixture 迁移
        const storageV3Test = new TestStorageV3();
        const storageV3Result = storageV3Test.runAll();
        this.results.push({ name: 'StorageV3', ...storageV3Result });

        // v3 应用用例：场次上下文、草稿、原子锁座、释放、过期与确认
        const commercialApplicationTest = new TestCommercialApplication();
        const commercialApplicationResult = commercialApplicationTest.runAll();
        this.results.push({ name: 'CommercialApp', ...commercialApplicationResult });

        // 生产 composition root：连续迁移、演示库存、v3 账户和推荐报价
        const commercialCompositionTest = new TestCommercialComposition();
        const commercialCompositionResult = commercialCompositionTest.runAll();
        this.results.push({ name: 'CommercialComposition', ...commercialCompositionResult });

        // v3 内部运维：权限、指标、锁座释放与安全恢复
        const commercialOperationsTest = new TestCommercialOperations();
        const commercialOperationsResult = commercialOperationsTest.runAll();
        this.results.push({ name: 'CommercialOperations', ...commercialOperationsResult });

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
