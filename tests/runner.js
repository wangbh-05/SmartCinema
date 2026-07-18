/**
 * 测试运行器
 * 运行所有测试并生成报告
 */

import TestDomainContracts from './test-domain-contracts.js';
import TestStorageV2 from './test-storage-v2.js';
import TestMigrationV2 from './test-migration-v2.js';
import TestCommercialDomain from './test-commercial-domain.js';
import TestStorageV3 from './test-storage-v3.js';
import TestCommercialApplication from './test-commercial-application.js';
import TestCommercialComposition from './test-commercial-composition.js';
import TestCommercialOperations from './test-commercial-operations.js';
import TestArchitectureBoundaries from './test-architecture-boundaries.js';

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

        // v2 迁移兼容领域：标识、库存、订单与用户
        const domainTest = new TestDomainContracts();
        const domainResult = domainTest.runAll();
        this.results.push({ name: 'DomainContracts', ...domainResult });

        // Storage v2 validator、revision repository 与 CheckoutIntent
        const storageV2Test = new TestStorageV2();
        const storageV2Result = storageV2Test.runAll();
        this.results.push({ name: 'StorageV2', ...storageV2Result });

        // v1 备份、校验、quarantine 与 v2 提交
        const migrationV2Test = new TestMigrationV2();
        const migrationV2Result = migrationV2Test.runAll();
        this.results.push({ name: 'MigrationV2', ...migrationV2Result });

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

        // 防止已退役 UI 链、跨入口依赖和浏览器全局重新污染分层
        const architectureTest = new TestArchitectureBoundaries();
        const architectureResult = architectureTest.runAll();
        this.results.push({ name: 'ArchitectureBoundaries', ...architectureResult });

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
