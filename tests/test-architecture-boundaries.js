import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
    return readFileSync(join(ROOT, relativePath), 'utf8');
}

function listJavaScript(relativeDirectory) {
    const directory = join(ROOT, relativeDirectory);
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const relativePath = join(relativeDirectory, entry.name);
        return entry.isDirectory() ? listJavaScript(relativePath) :
            (entry.isFile() && entry.name.endsWith('.js') ? [relativePath] : []);
    });
}

export default class TestArchitectureBoundaries {
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

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    runAll() {
        console.log('\n========== Production Architecture Boundary 测试 ==========\n');

        this.test('已退役页面与启动脚本不得重新进入仓库', () => {
            const retired = [
                'legacy.html',
                'order.html',
                'src/app.js',
                'src/order.js',
                'src/bootstrap.js',
                'public/styles/app.css',
                'public/styles/order.css',
                'public/styles/internal-tools.css'
            ];
            const present = retired.filter(relativePath => existsSync(join(ROOT, relativePath)));
            this.assertTrue(present.length === 0, `仍存在：${present.join('、')}`);
        });

        this.test('消费者与运维入口必须使用各自的薄启动脚本', () => {
            const consumer = read('index.html');
            const operations = read('internal.html');
            this.assertTrue(consumer.includes('src/commercial.js'), '消费者入口未使用 commercial.js');
            this.assertTrue(!consumer.includes('src/internal.js'), '消费者入口加载了运维脚本');
            this.assertTrue(operations.includes('src/internal.js'), '运维入口未使用 internal.js');
            this.assertTrue(!operations.includes('src/commercial.js'), '运维入口加载了消费者脚本');
        });

        this.test('消费者页面不得提供内部工具导航', () => {
            const consumer = read('index.html');
            this.assertTrue(!/href=["'][^"']*(?:internal|legacy)/.test(consumer), '消费者页面暴露内部入口');
        });

        this.test('领域与应用层不得访问浏览器全局对象', () => {
            const boundaryFiles = [
                ...listJavaScript('src/domain'),
                ...listJavaScript('src/application')
            ];
            const violations = boundaryFiles.filter(relativePath =>
                /\b(?:document|window|localStorage|sessionStorage)\b/.test(read(relativePath))
            );
            this.assertTrue(violations.length === 0, `浏览器依赖泄漏：${violations.join('、')}`);
        });

        this.test('生产源码不得保留 Canvas、热图、购前评分和模拟器链', () => {
            const sourceFiles = listJavaScript('src');
            const retiredFragments = [
                '/canvas/',
                'SeatData',
                'Heatmap',
                'ScoringController',
                'AIChatbot',
                'RealtimeEventSimulator'
            ];
            const violations = sourceFiles.filter(relativePath =>
                retiredFragments.some(fragment => relativePath.includes(fragment))
            );
            this.assertTrue(violations.length === 0, `仍存在旧链：${violations.join('、')}`);
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
