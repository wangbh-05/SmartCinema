/**
 * 测试运行器
 * 运行所有测试并生成报告
 */

import TestSeatData from './test-seatdata.js';
import TestRecommendEngine from './test-recommend.js';
import TestScoreEngine from './test-score.js';
import TestOrderManager from './test-order.js';
import TestRegressionContracts from './test-regressions.js';

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

        // 运行 RecommendEngine 测试
        const recommendTest = new TestRecommendEngine();
        const recommendResult = recommendTest.runAll();
        this.results.push({ name: 'RecommendEngine', ...recommendResult });

        // 运行 ScoreEngine 测试
        const scoreTest = new TestScoreEngine();
        const scoreResult = scoreTest.runAll();
        this.results.push({ name: 'ScoreEngine', ...scoreResult });

        // 运行 OrderManager 测试
        const orderTest = new TestOrderManager();
        const orderResult = orderTest.runAll();
        this.results.push({ name: 'OrderManager', ...orderResult });

        // 已知缺陷契约：修复前稳定 XFAIL，异常或意外通过会计为失败
        const regressionTest = new TestRegressionContracts();
        const regressionResult = regressionTest.runAll();
        this.results.push({ name: 'RegressionContracts', ...regressionResult });

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
