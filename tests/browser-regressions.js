/**
 * 真实浏览器中的已知缺陷契约。
 *
 * 页面通过同源 iframe 运行生产入口，不读取实现源码，也不依赖共享的用户数据。
 * ContractFailure 表示目标行为被当前 Bug 稳定违反；其他异常必须显示为 ERROR。
 */

import { SeatData, SEAT_STATUS } from '../src/core/SeatData.js';

class ContractFailure extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContractFailure';
    }
}

const state = {
    pass: 0,
    xfail: 0,
    xpass: 0,
    error: 0
};

const fixture = document.getElementById('fixture');
const results = document.getElementById('results');
const status = document.getElementById('run-status');

function assertContract(condition, message) {
    if (!condition) {
        throw new ContractFailure(message);
    }
}

function clearTestStorage() {
    const localKeys = [];
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith('smartcinema_')) localKeys.push(key);
    }
    localKeys.forEach(key => localStorage.removeItem(key));

    const sessionKeys = [];
    for (let index = 0; index < sessionStorage.length; index++) {
        const key = sessionStorage.key(index);
        if (key?.startsWith('smartcinema_')) sessionKeys.push(key);
    }
    sessionKeys.forEach(key => sessionStorage.removeItem(key));
}

function delay(milliseconds = 0) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, message, timeout = 4000) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const value = predicate();
        if (value) return value;
        await delay(25);
    }
    throw new Error(`等待超时：${message}`);
}

async function createFrame(path = '/', width = 1200) {
    const frame = document.createElement('iframe');
    frame.title = 'SmartCinema 回归测试夹具';
    frame.style.width = `${width}px`;
    frame.style.height = '900px';
    frame.src = `${path}#regression-${Date.now()}-${Math.random()}`;
    fixture.appendChild(frame);

    await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(`iframe 加载超时：${path}`)), 5000);
        frame.addEventListener('load', () => {
            window.clearTimeout(timer);
            resolve();
        }, { once: true });
    });

    return frame;
}

async function createAppFrame(width = 1200, preserveStorage = false) {
    if (!preserveStorage) clearTestStorage();
    const frame = await createFrame('/', width);
    await waitFor(() => frame.contentWindow?.app, 'SmartCinema app 初始化');
    return frame;
}

function disposeFrame(frame) {
    try {
        frame.contentWindow?.app?.realtime?.stop();
    } catch (error) {
        console.warn('停止测试 realtime 失败', error);
    }
    frame.remove();
}

function findSeatAvailableOnBothDays(hallType, firstDay, secondDay) {
    const first = new SeatData(hallType);
    const second = new SeatData(hallType);
    first.initializeSeats(firstDay);
    second.initializeSeats(secondDay);

    for (let row = 0; row < first.rows; row++) {
        for (let col = 0; col < first.cols; col++) {
            if (first.isSeatAvailable(row, col) && second.isSeatAvailable(row, col)) {
                return { row, col, key: `${row}-${col}` };
            }
        }
    }
    throw new Error('无法找到两个日期都可用的确定性座位');
}

function addPendingResult(id, name) {
    const item = document.createElement('li');
    item.className = 'result pending';
    item.innerHTML = `<strong>${id} · ${name}</strong><p>运行中…</p>`;
    results.appendChild(item);
    return item;
}

function updateSummary() {
    document.getElementById('pass-count').textContent = String(state.pass);
    document.getElementById('xfail-count').textContent = String(state.xfail);
    document.getElementById('xpass-count').textContent = String(state.xpass);
    document.getElementById('error-count').textContent = String(state.error);
}

async function regression(id, name, test) {
    const item = addPendingResult(id, name);
    try {
        await test();
        state.pass++;
        item.className = 'result pass';
        item.querySelector('p').textContent = '目标契约通过。';
    } catch (error) {
        state.error++;
        item.className = 'result error';
        item.querySelector('p').textContent = `${error.name}: ${error.message}`;
    }
    updateSummary();
}

async function xfail(id, name, test) {
    const item = addPendingResult(id, name);

    try {
        await test();
        state.xpass++;
        item.className = 'result xpass';
        item.querySelector('p').textContent = '目标契约已通过；请把本项转为普通回归测试。';
    } catch (error) {
        if (error instanceof ContractFailure) {
            state.xfail++;
            item.className = 'result xfail';
            item.querySelector('p').textContent = error.message;
        } else {
            state.error++;
            item.className = 'result error';
            item.querySelector('p').textContent = `${error.name}: ${error.message}`;
        }
    }

    updateSummary();
}

async function run() {
    if (location.hostname !== '127.0.0.1') {
        status.textContent = '停止：请使用 127.0.0.1 隔离测试数据';
        document.documentElement.dataset.status = 'wrong-origin';
        return;
    }

    status.textContent = '运行中…';
    clearTestStorage();

    await regression('BUG-001', '已售库存必须按影厅与日期隔离', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const target = findSeatAvailableOnBothDays('medium', 3, 4);
            const purchased = app.controller.applyRemotePurchase({
                showtimeId: 'medium:day:3',
                seatKey: target.key
            });
            if (!purchased.ok) throw new Error(`测试准备失败：${purchased.error.message}`);

            app.switchDay(3);
            const soldOnFirstDay = app.seatData.getSeat(target.row, target.col).status === SEAT_STATUS.OCCUPIED;
            app.switchDay(4);
            const soldOnSecondDay = app.seatData.getSeat(target.row, target.col).status === SEAT_STATUS.OCCUPIED;

            assertContract(soldOnFirstDay, '测试准备失败：首个日期没有应用已售库存');
            assertContract(!soldOnSecondDay, `${target.key} 在周四售出后错误地污染了周五库存`);
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-003', '确认支付必须对快速重复点击幂等', async () => {
        const appFrame = await createAppFrame();
        const seatData = new SeatData('small');
        seatData.initializeSeats(3);
        let selected = null;
        for (let row = 0; row < seatData.rows && !selected; row++) {
            selected = seatData.findConsecutiveInRow(row, 1);
        }
        if (!selected) throw new Error('无法为订单测试找到可用座位');
        const seat = seatData.getSeat(selected[0].row, selected[0].col);
        const controller = appFrame.contentWindow.app.controller;
        const registered = controller.register({
            username: 'browser-user',
            password: 'browser123',
            name: '浏览器测试用户',
            email: 'browser@example.test'
        });
        if (!registered.ok) throw new Error(`注册测试用户失败：${registered.error.message}`);
        const checkout = controller.startCheckout({
            showtimeId: 'small:day:3',
            seats: [{
                seatKey: `${seat.row}-${seat.col}`,
                row: seat.row,
                col: seat.col,
                unitPrice: seat.price
            }]
        });
        if (!checkout.ok) throw new Error(`创建 CheckoutIntent 失败：${checkout.error.message}`);
        disposeFrame(appFrame);

        const frame = await createFrame('/order.html');
        try {
            const button = await waitFor(
                () => frame.contentDocument?.getElementById('btn-confirm'),
                '确认支付按钮'
            );
            button.click();
            button.click();

            const stateV2 = JSON.parse(localStorage.getItem('smartcinema_state_v2'));
            const orders = Object.values(stateV2.ordersById);
            assertContract(orders.length === 1, `快速双击创建了 ${orders.length} 个订单`);
            assertContract(button.disabled, '首次提交后确认按钮没有进入禁用状态');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-005', '文本输入中的 Ctrl+Z 不得清空座位', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const doc = frame.contentDocument;
            let target = null;
            for (let row = 0; row < app.seatData.rows && !target; row++) {
                target = app.seatData.findConsecutiveInRow(row, 1);
            }
            if (!target) throw new Error('无法找到可用座位');

            app.seatData.selectSeat(target[0].row, target[0].col);
            app.updateUI();
            const input = doc.getElementById('member-names');
            input.value = '测试成员';
            input.focus();
            input.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {
                key: 'z',
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            }));

            assertContract(app.seatData.selectedSeats.size === 1, '输入框撤销操作把已选座位清空了');
        } finally {
            disposeFrame(frame);
        }
    });

    await xfail('BUG-006', '目标视口矩阵不得产生页面横向溢出', async () => {
        const widths = [320, 390, 768, 800, 900, 1024, 1440];
        const frame = await createAppFrame(1440);
        try {
            const failures = [];
            for (const width of widths) {
                frame.style.width = `${width}px`;
                frame.contentWindow.dispatchEvent(new Event('resize'));
                await delay(40);
                const root = frame.contentDocument.documentElement;
                if (root.scrollWidth > root.clientWidth + 1) {
                    failures.push(`${width}px: ${root.scrollWidth} > ${root.clientWidth}`);
                }
            }

            assertContract(failures.length === 0, `横向溢出：${failures.join('；')}`);
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-007', '登录与注册表单必须支持 Enter 提交', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const doc = frame.contentDocument;
            app.showAuthModal('login');
            doc.getElementById('auth-username').value = 'missing-user';
            doc.getElementById('auth-password').value = 'valid123';
            doc.getElementById('auth-form').dispatchEvent(new Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();

            const errorText = doc.getElementById('auth-error').textContent.trim();
            assertContract(errorText.length > 0, '按 Enter 提交后没有运行认证逻辑或显示错误');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-008', '内容区开始的拖动不得在遮罩释放时关闭弹窗', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            app.showAuthModal('login');
            const overlay = doc.getElementById('auth-modal');
            const content = overlay.querySelector('.auth-modal');
            const PointerEventClass = win.PointerEvent || win.MouseEvent;

            content.dispatchEvent(new PointerEventClass('pointerdown', { bubbles: true }));
            overlay.dispatchEvent(new PointerEventClass('pointerup', { bubbles: true }));
            overlay.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

            assertContract(overlay.classList.contains('active'), '从内容拖到遮罩释放后弹窗被误关闭');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-009', '弹窗必须有语义关闭键、Escape 与焦点归还', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            const trigger = doc.getElementById('btn-login');
            trigger.focus();
            trigger.click();
            const overlay = doc.getElementById('auth-modal');
            const semanticClose = overlay.querySelector('button[aria-label*="关闭"]');

            doc.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true
            }));

            const closesOnEscape = !overlay.classList.contains('active');
            const restoresFocus = doc.activeElement === trigger;
            assertContract(
                Boolean(semanticClose) && closesOnEscape && restoresFocus,
                `语义关闭键=${Boolean(semanticClose)}，Escape关闭=${closesOnEscape}，焦点归还=${restoresFocus}`
            );
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-010', '语音与实时设置必须持久化并在加载时恢复', async () => {
        const firstFrame = await createAppFrame();
        const firstDoc = firstFrame.contentDocument;
        const firstWin = firstFrame.contentWindow;
        const voice = firstDoc.getElementById('voice-toggle');
        const realtime = firstDoc.getElementById('realtime-toggle');
        voice.checked = true;
        voice.dispatchEvent(new firstWin.Event('change', { bubbles: true }));
        realtime.checked = true;
        realtime.dispatchEvent(new firstWin.Event('change', { bubbles: true }));
        firstWin.app.realtime.stop();
        disposeFrame(firstFrame);

        const secondFrame = await createAppFrame(1200, true);
        try {
            const secondDoc = secondFrame.contentDocument;
            const secondApp = secondFrame.contentWindow.app;
            const voiceRestored = secondDoc.getElementById('voice-toggle').checked;
            const realtimeRestored = secondDoc.getElementById('realtime-toggle').checked;
            const realtimeRunning = secondApp.realtime.running;

            assertContract(
                voiceRestored && realtimeRestored && realtimeRunning,
                `语音=${voiceRestored}，实时开关=${realtimeRestored}，实时运行=${realtimeRunning}`
            );
        } finally {
            disposeFrame(secondFrame);
        }
    });

    await regression('BUG-011', '座位变化后旧综合评分必须失效', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const doc = frame.contentDocument;
            let target = null;
            for (let row = 0; row < app.seatData.rows && !target; row++) {
                target = app.seatData.findConsecutiveInRow(row, 1);
            }
            if (!target) throw new Error('无法找到可用座位');

            app.seatData.selectSeat(target[0].row, target[0].col);
            app.updateScore();
            doc.getElementById('btn-submit-score').click();
            const combined = doc.getElementById('combined-score-result');
            const wasVisible = frame.contentWindow.getComputedStyle(combined).display !== 'none';
            app.handleClear();
            const remainsVisible = frame.contentWindow.getComputedStyle(combined).display !== 'none';

            if (!wasVisible) throw new Error('测试准备失败：综合评分没有显示');
            assertContract(!remainsVisible, '清空座位后仍显示基于旧座位的综合评分');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-012', '快捷键帮助必须与实际处理器一致', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            let exportCalls = 0;
            let importCalls = 0;
            app.handleExport = () => { exportCalls++; };
            app.handleImport = () => { importCalls++; };

            doc.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'k',
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            }));
            const help = doc.getElementById('keyboard-help');
            if (!help) throw new Error('Ctrl+K 没有打开快捷键帮助');
            const helpText = help.textContent;

            doc.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'e',
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            }));
            doc.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'i',
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            }));

            const exportDeclared = helpText.includes('Ctrl + E');
            const importDeclared = helpText.includes('Ctrl + I');
            assertContract(
                exportDeclared === (exportCalls > 0) && importDeclared === (importCalls > 0),
                `帮助声明 E/I=${exportDeclared}/${importDeclared}，实际处理=${exportCalls}/${importCalls}`
            );
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-013', '用户可控账户字段必须作为纯文本渲染', async () => {
        const frame = await createAppFrame();
        try {
            const app = frame.contentWindow.app;
            const doc = frame.contentDocument;
            const payload = '<img src=x onerror=alert(1)>';
            app.showAuthModal('register');
            doc.getElementById('auth-username').value = 'safe-render-user';
            doc.getElementById('auth-password').value = 'browser123';
            doc.getElementById('auth-name').value = payload;
            doc.getElementById('auth-email').value = 'safe@example.test';
            doc.getElementById('auth-form').dispatchEvent(new Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();

            const userInfo = doc.getElementById('user-info');
            assertContract(
                userInfo.textContent.includes(payload) && !userInfo.querySelector('img'),
                '注册姓名被解释为 HTML，存在 DOM 注入风险'
            );
        } finally {
            disposeFrame(frame);
        }
    });

    clearTestStorage();
    const expected = state.pass === 10 && state.xfail === 1 && state.xpass === 0 && state.error === 0;
    status.textContent = expected ? '完成：10 个修复通过，1 个响应式问题稳定复现' : '完成：结果与当前预期不一致';
    document.documentElement.dataset.status = 'complete';
    document.documentElement.dataset.pass = String(state.pass);
    document.documentElement.dataset.xfail = String(state.xfail);
    document.documentElement.dataset.xpass = String(state.xpass);
    document.documentElement.dataset.error = String(state.error);
}

run().catch(error => {
    state.error++;
    updateSummary();
    status.textContent = `测试运行器失败：${error.message}`;
    document.documentElement.dataset.status = 'runner-error';
});
