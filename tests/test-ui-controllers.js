/**
 * 设置、订单面板与 Toast 控制器测试。
 */

import { ToastController } from '../src/ui/components/ToastController.js';
import { AccountController } from '../src/ui/controllers/AccountController.js';
import { AdminPanelController } from '../src/ui/controllers/AdminPanelController.js';
import { ChatbotController } from '../src/ui/controllers/ChatbotController.js';
import { OrdersPanelController } from '../src/ui/controllers/OrdersPanelController.js';
import { RecommendationController } from '../src/ui/controllers/RecommendationController.js';
import { ScoringController } from '../src/ui/controllers/ScoringController.js';
import { SettingsController } from '../src/ui/controllers/SettingsController.js';

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    toggle(name, force) {
        const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
        if (enabled) this.values.add(name);
        else this.values.delete(name);
        return enabled;
    }

    contains(name) {
        return this.values.has(name);
    }

    add(name) {
        this.values.add(name);
    }

    remove(name) {
        this.values.delete(name);
    }
}

class FakeElement {
    constructor(tagName = 'div', id = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = '';
        this.classList = new FakeClassList();
        this.dataset = {};
        this.style = {
            values: new Map(),
            setProperty: (name, value) => this.style.values.set(name, value)
        };
        this.attributes = new Map();
        this.listeners = new Map();
        this.children = [];
        this.textContent = '';
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.value = '';
        this.type = '';
        this.focused = false;
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type) {
        (this.listeners.get(type) || []).forEach(listener => listener({ target: this }));
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children = [...children];
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    focus() {
        this.focused = true;
    }
}

class FakeDocument {
    constructor() {
        this.elements = new Map();
        this.body = new FakeElement('body', 'body');
        this.documentElement = new FakeElement('html', 'html');
        this.themeDots = [];
        this.ageChecks = [];
    }

    add(id, tagName = 'div') {
        const element = new FakeElement(tagName, id);
        this.elements.set(id, element);
        return element;
    }

    getElementById(id) {
        return this.elements.get(id) || null;
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    querySelectorAll(selector) {
        if (selector === '.theme-dot') return this.themeDots;
        if (selector === '.age-check:checked') return this.ageChecks.filter(control => control.checked);
        return [];
    }
}

class FakeScheduler {
    constructor() {
        this.sequence = 0;
        this.tasks = new Map();
    }

    setTimeout(callback) {
        const id = ++this.sequence;
        this.tasks.set(id, callback);
        return id;
    }

    clearTimeout(id) {
        this.tasks.delete(id);
    }

    run(id) {
        const callback = this.tasks.get(id);
        if (callback) callback();
    }
}

class TestUiControllers {
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

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    assertFalse(value, message = '') {
        if (value) throw new Error(`Expected false. ${message}`);
    }

    runAll() {
        console.log('\n========== UI Controller 测试 ==========\n');

        this.test('SettingsController load 应同步控件与全部外部效果', () => {
            const context = this._settingsContext({
                theme: 'dark',
                accessibilityMode: true,
                voiceEnabled: true,
                colorblindMode: true,
                realtimeEnabled: true,
                accentColor: '#10B981'
            });
            this.assertTrue(context.settingsController.load());
            this.assertTrue(context.document.body.classList.contains('dark-mode'));
            this.assertTrue(context.document.body.classList.contains('accessibility-mode'));
            this.assertTrue(context.document.body.classList.contains('colorblind-mode'));
            this.assertTrue(context.voiceValues.includes(true));
            this.assertTrue(context.colorblindValues.includes(true));
            this.assertEqual(context.realtimeStarts.value, 1);
            this.assertEqual(context.document.getElementById('accent-picker').value, '#10B981');
            this.assertTrue(context.document.themeDots[1].classList.contains('active'));
        });

        this.test('SettingsController 写入失败不得应用用户请求的副作用', () => {
            const context = this._settingsContext();
            context.controller.updateSettings = () => ({
                ok: false,
                error: { message: 'quota exceeded' }
            });
            const changed = context.settingsController.setColorblindMode(true);
            this.assertFalse(changed);
            this.assertEqual(context.colorblindValues.at(-1), false);
            this.assertFalse(context.document.body.classList.contains('colorblind-mode'));
            this.assertEqual(context.errors[0], 'quota exceeded');
        });

        this.test('ToastController 应提供 status 语义并替换旧计时器', () => {
            const document = new FakeDocument();
            const scheduler = new FakeScheduler();
            const toast = new ToastController({ document, scheduler });
            toast.show('第一条');
            const firstTimer = toast.timer;
            toast.show('第二条');
            this.assertFalse(scheduler.tasks.has(firstTimer));
            this.assertEqual(toast.element.textContent, '第二条');
            this.assertEqual(toast.element.attributes.get('role'), 'status');
            this.assertEqual(toast.element.dataset.visible, 'true');
            scheduler.run(toast.timer);
            this.assertEqual(toast.element.dataset.visible, 'false');
        });

        this.test('AccountController 应将用户字段作为纯文本安全渲染', () => {
            const document = new FakeDocument();
            document.add('btn-login', 'button');
            document.add('btn-register', 'button');
            document.add('btn-logout', 'button');
            document.add('btn-admin', 'button');
            const userInfo = document.add('user-info');
            const auth = {
                isLoggedIn: () => true,
                isAdmin: () => false,
                getCurrentUser: () => ({ name: '<img src=x onerror=alert(1)>' })
            };
            const account = new AccountController({ auth, document });
            account.render();
            this.assertEqual(userInfo.children[0].textContent, '👤 <img src=x onerror=alert(1)>');
            this.assertEqual(userInfo.children[0].children.length, 0);
            this.assertEqual(userInfo.children[1].textContent, '会员');
            this.assertEqual(userInfo.style.display, 'flex');
        });

        this.test('AdminPanelController 应复用统一 Dialog 并安全渲染用户表格', () => {
            const document = new FakeDocument();
            const overlay = document.add('modal-container');
            const dialogCalls = [];
            const user = {
                username: '<svg onload=alert(1)>',
                name: '<Admin>',
                role: 'admin',
                email: 'admin@example.test',
                createdAt: '2026-07-18T00:00:00.000Z'
            };
            const panel = new AdminPanelController({
                auth: {
                    isAdmin: () => true,
                    getAllUsers: () => [user]
                },
                orderManager: {
                    getStatistics: () => ({ totalOrders: 1, confirmedOrders: 1, totalRevenue: 120 })
                },
                document,
                formatDate: () => '2026/7/18',
                dialogFactory: () => ({
                    open: options => dialogCalls.push(options),
                    close: () => {}
                })
            });
            this.assertTrue(panel.open(new FakeElement('button')));
            const dialog = overlay.children[0];
            const body = dialog.children[1];
            const userSection = body.children[0].children[2];
            const tableBody = userSection.children[1].children[1];
            const usernameCell = tableBody.children[0].children[0];
            this.assertEqual(usernameCell.textContent, user.username);
            this.assertEqual(usernameCell.children.length, 0);
            this.assertEqual(dialogCalls.length, 1);
        });

        this.test('ChatbotController 应使用按钮建议并安全追加对话文本', () => {
            const document = new FakeDocument();
            document.add('ai-chat-toggle', 'button');
            document.add('ai-chat-panel');
            document.add('ai-chat-close', 'button');
            document.add('ai-chat-send', 'button');
            const input = document.add('ai-chat-input', 'input');
            const messages = document.add('ai-chat-messages');
            const suggestions = document.add('ai-chat-suggestions');
            const scheduler = new FakeScheduler();
            const controller = new ChatbotController({
                chatbot: { chat: () => '<img src=x onerror=alert(1)>' },
                document,
                getSeatData: () => ({}),
                scheduler,
                random: () => 0
            });
            controller.bind();
            this.assertEqual(suggestions.children[0].tagName, 'BUTTON');
            input.value = '<用户输入>';
            this.assertTrue(controller.send());
            scheduler.run([...scheduler.tasks.keys()][0]);
            this.assertEqual(messages.children[0].textContent, '<用户输入>');
            this.assertEqual(messages.children[1].textContent, '<img src=x onerror=alert(1)>');
            this.assertEqual(messages.children[1].children.length, 0);
        });

        this.test('OrdersPanelController 应从座位快照更新结算摘要', () => {
            const { panel, document } = this._ordersContext([]);
            panel.updateCheckoutSummary([{ price: 80 }, { price: 120 }], false);
            this.assertEqual(document.getElementById('order-summary-mini').textContent, '已选 2 座 · 合计 ¥200');
            this.assertTrue(document.getElementById('btn-submit-order').disabled);
            panel.updateCheckoutSummary([{ price: 80 }], true);
            this.assertFalse(document.getElementById('btn-submit-order').disabled);
        });

        this.test('OrdersPanelController 应使用 textContent 安全渲染订单字段', () => {
            const order = this._order({ id: '<img src=x onerror=alert(1)>' });
            const { panel, document } = this._ordersContext([order]);
            panel.render();
            const container = document.getElementById('orders-mini-list');
            const card = container.children[1];
            const renderedId = card.children[0].children[0];
            this.assertEqual(renderedId.textContent, order.id);
            this.assertEqual(renderedId.children.length, 0);
        });

        this.test('OrdersPanelController 退票成功应刷新、重绘并播报结果', () => {
            const order = this._order();
            const context = this._ordersContext([order]);
            this.assertTrue(context.panel.cancel(order.id));
            this.assertEqual(context.cancelled[0], order);
            this.assertEqual(context.announcements[0], '退票成功');
            this.assertEqual(context.confirmations[0], '确定要退票吗？');
        });

        this.test('RecommendationController 应读取表单并用安全 DOM 渲染应用结果', () => {
            const document = new FakeDocument();
            document.add('recommend-form', 'form');
            document.add('group-size', 'input').value = '1';
            document.add('recommend-result');
            document.add('age-select-container');
            document.add('age-check-container');
            document.add('name-single-wrapper');
            document.add('name-group-wrapper');
            document.add('member-count-hint');
            document.add('movie-type', 'select');
            document.add('age-group', 'select').value = 'adult';
            document.add('user-name', 'input').value = '<Alice>';
            const recommendation = {
                seats: [{ seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }],
                reason: '第一行\n第二行'
            };
            const previewed = [];
            const applied = [];
            const controller = {
                recommendSeats: () => ({ ok: true, value: { recommendation } }),
                getState: () => ({ recommendation })
            };
            const recommendationController = new RecommendationController({
                controller,
                document,
                getSeatLayout: () => ({}),
                requireAuth: () => true,
                onPreview: seats => previewed.push(seats),
                onApply: seats => applied.push(seats)
            });
            recommendationController.updateForm();
            document.getElementById('movie-type').value = 'solo';
            this.assertTrue(recommendationController.submit());
            const result = document.getElementById('recommend-result');
            this.assertEqual(result.children[1].textContent, '👤 <Alice>');
            this.assertEqual(result.children[1].children.length, 0);
            this.assertEqual(previewed[0][0].seatKey, '5-8');
            this.assertTrue(recommendationController.apply());
            this.assertEqual(applied[0][0].seatKey, '5-8');
        });

        this.test('ScoringController 应同步选择并渲染结构化系统与综合评分', () => {
            const document = new FakeDocument();
            document.add('score-details');
            document.add('manual-score-panel');
            document.add('combined-score-result');
            ['vision', 'distance', 'comfort', 'price'].forEach(key => {
                document.add(`manual-${key}`, 'input').value = '8';
                document.add(`manual-${key}-val`);
            });
            document.add('btn-submit-score', 'button');
            const selectionCalls = [];
            const systemScore = {
                totalScore: 82,
                grade: 'excellent',
                gradeText: '极佳',
                details: [{
                    emoji: '👁️',
                    category: '视野质量',
                    description: '极佳',
                    score: '9.0',
                    maxScore: 10
                }],
                recommendations: [{ message: '值得推荐' }]
            };
            const combinedScore = {
                systemTotal: 82,
                manualTotal: 80,
                totalScore: 81,
                gradeText: '极佳'
            };
            const controller = {
                replaceSelection: keys => {
                    selectionCalls.push(keys);
                    return { ok: true };
                },
                calculateSystemScore: () => ({ ok: true, value: { systemScore } }),
                submitManualScore: () => ({ ok: true, value: { combinedScore } })
            };
            const scoringController = new ScoringController({
                controller,
                document,
                getSeatLayout: () => ({
                    seats: [[{ seatKey: '0-0', isSelected: true }]]
                })
            });
            this.assertTrue(scoringController.update());
            this.assertEqual(selectionCalls[0][0], '0-0');
            this.assertFalse(document.getElementById('manual-score-panel').hidden);
            this.assertTrue(scoringController.submitManualScore());
            this.assertFalse(document.getElementById('combined-score-result').hidden);
        });

        return this.printSummary();
    }

    _settingsContext(overrides = {}) {
        const document = new FakeDocument();
        Object.values({
            theme: 'theme-toggle',
            accessibility: 'accessibility-toggle',
            voice: 'voice-toggle',
            colorblind: 'colorblind-toggle',
            realtime: 'realtime-toggle'
        }).forEach(id => document.add(id, 'input'));
        document.add('accent-picker', 'input');
        const firstDot = new FakeElement('button');
        firstDot.dataset.accent = '#58A6FF';
        const secondDot = new FakeElement('button');
        secondDot.dataset.accent = '#10B981';
        document.themeDots = [firstDot, secondDot];

        const settings = {
            theme: 'light',
            accessibilityMode: false,
            voiceEnabled: false,
            colorblindMode: false,
            realtimeEnabled: false,
            accentColor: '#58A6FF',
            ...overrides
        };
        const controller = {
            getState: () => ({ settings }),
            updateSettings: patch => {
                Object.assign(settings, patch);
                return { ok: true, value: { state: { settings } } };
            }
        };
        const voiceValues = [];
        const colorblindValues = [];
        const realtimeStarts = { value: 0 };
        const realtimeStops = { value: 0 };
        const errors = [];
        const settingsController = new SettingsController({
            controller,
            document,
            a11yManager: {
                setVoiceEnabled: value => voiceValues.push(value),
                speak: () => {}
            },
            cinema: { setColorblindMode: value => colorblindValues.push(value) },
            realtime: {
                start: () => { realtimeStarts.value++; },
                stop: () => { realtimeStops.value++; }
            },
            onError: message => errors.push(message)
        });
        return {
            controller,
            document,
            settingsController,
            voiceValues,
            colorblindValues,
            realtimeStarts,
            realtimeStops,
            errors
        };
    }

    _ordersContext(orders) {
        const document = new FakeDocument();
        const container = document.add('orders-mini-list');
        container.hidden = true;
        document.add('order-summary-mini');
        document.add('btn-submit-order', 'button');
        document.add('btn-view-orders', 'button');
        const confirmations = [];
        const notifications = [];
        const cancelled = [];
        const announcements = [];
        const orderManager = {
            getOrders: () => orders,
            getOrder: orderId => orders.find(order => order.id === orderId) || null,
            getStatistics: () => ({
                totalOrders: orders.length,
                confirmedOrders: orders.filter(order => order.status === 'confirmed').length,
                totalRevenue: orders.reduce((sum, order) => sum + order.totalPrice, 0)
            }),
            getStatusText: status => status === 'confirmed' ? '已确认' : status,
            cancelOrder: () => ({ success: true }),
            generateReceipt: orderId => orders.some(order => order.id === orderId) ? 'receipt' : null
        };
        const panel = new OrdersPanelController({
            orderManager,
            document,
            confirmAction: message => {
                confirmations.push(message);
                return true;
            },
            notify: message => notifications.push(message),
            onCancelled: order => cancelled.push(order),
            onAnnounce: message => announcements.push(message)
        });
        return { panel, document, confirmations, notifications, cancelled, announcements };
    }

    _order(overrides = {}) {
        return {
            id: 'ord-1',
            status: 'confirmed',
            hallName: '中厅',
            dayIndex: 3,
            seats: [{ row: 4, col: 7, price: 120 }],
            totalPrice: 120,
            ...overrides
        };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestUiControllers;
