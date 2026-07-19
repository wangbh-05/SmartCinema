/**
 * 商业购票入口的真实浏览器契约。
 *
 * 每项测试通过同源 iframe 只操作生产 DOM 与 Web Storage，不导入页面实现对象。
 */

class ContractFailure extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContractFailure';
    }
}

const state = { pass: 0, xfail: 0, xpass: 0, error: 0 };
const fixture = document.getElementById('fixture');
const results = document.getElementById('results');
const status = document.getElementById('run-status');
const runtimeErrors = [];

function assertContract(condition, message) {
    if (!condition) throw new ContractFailure(message);
}

function clearTestStorage() {
    for (const storage of [localStorage, sessionStorage]) {
        const keys = [];
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            if (key?.startsWith('smartcinema_')) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
    }
}

function delay(milliseconds = 0) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, message, timeout = 5000) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const value = predicate();
        if (value) return value;
        await delay(25);
    }
    throw new Error(`等待超时：${message}`);
}

async function createAppFrame(width = 1200, preserveStorage = false) {
    if (!preserveStorage) clearTestStorage();
    const frame = document.createElement('iframe');
    frame.title = 'SmartCinema 商业购票回归夹具';
    frame.style.width = `${width}px`;
    frame.style.height = '900px';
    frame.src = `/#regression-${Date.now()}-${Math.random()}`;
    fixture.appendChild(frame);
    await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('iframe 加载超时')), 5000);
        frame.addEventListener('load', () => {
            window.clearTimeout(timer);
            resolve();
        }, { once: true });
    });
    frame.contentWindow.addEventListener('error', event => {
        runtimeErrors.push(event.message || '未知运行时错误');
    });
    frame.contentWindow.addEventListener('unhandledrejection', event => {
        runtimeErrors.push(event.reason?.message || String(event.reason));
    });
    await waitFor(
        () => [100, 200, 300].includes(frame.contentDocument?.querySelectorAll('.seat-button').length),
        '商业座位图初始化'
    );
    return frame;
}

async function createOperationsFrame(width = 1200, preserveStorage = false) {
    if (!preserveStorage) clearTestStorage();
    const frame = document.createElement('iframe');
    frame.title = 'SmartCinema 内部运维回归夹具';
    frame.style.width = `${width}px`;
    frame.style.height = '900px';
    frame.src = `/internal.html#regression-${Date.now()}-${Math.random()}`;
    fixture.appendChild(frame);
    await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('运维 iframe 加载超时')), 5000);
        frame.addEventListener('load', () => {
            window.clearTimeout(timer);
            resolve();
        }, { once: true });
    });
    frame.contentWindow.addEventListener('error', event => {
        runtimeErrors.push(event.message || '未知运维运行时错误');
    });
    frame.contentWindow.addEventListener('unhandledrejection', event => {
        runtimeErrors.push(event.reason?.message || String(event.reason));
    });
    await waitFor(
        () => ['access-gate', 'dashboard-ready', 'fatal'].includes(
            frame.contentDocument?.documentElement.dataset.operationsStatus
        ),
        '内部运维入口初始化'
    );
    return frame;
}

function disposeFrame(frame) {
    frame.remove();
}

function addPendingResult(id, name) {
    const item = document.createElement('li');
    item.className = 'result pending';
    const title = document.createElement('strong');
    title.textContent = `${id} · ${name}`;
    const description = document.createElement('p');
    description.textContent = '运行中…';
    item.append(title, description);
    results.appendChild(item);
    return item;
}

function updateSummary() {
    Object.entries(state).forEach(([key, value]) => {
        document.getElementById(`${key}-count`).textContent = String(value);
    });
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

function recommend(doc) {
    doc.getElementById('recommend-seats').click();
}

function openHold(doc) {
    recommend(doc);
    doc.getElementById('continue-booking').click();
}

async function run() {
    if (location.hostname !== '127.0.0.1') {
        status.textContent = '停止：请使用 127.0.0.1 隔离测试数据';
        document.documentElement.dataset.status = 'wrong-origin';
        return;
    }

    status.textContent = '运行中…';
    clearTestStorage();

    await regression('UX-001', '生产入口应是商业购票漏斗而非功能仪表盘', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            assertContract(doc.getElementById('ticket-limit').textContent.includes('20'), '页面未披露 20 张团体上限');
            assertContract(
                [100, 200, 300].includes(doc.querySelectorAll('.seat-button').length),
                '默认场次没有渲染完整的小/中/大厅座位图'
            );
            assertContract(Boolean(doc.getElementById('seat-layout-canvas')), '生产入口缺少 Canvas 座位图');
            assertContract(Boolean(doc.getElementById('seat-heat-canvas')), '生产入口缺少 Canvas 热度层');
            assertContract(!doc.getElementById('experience-score'), '消费者页面仍暴露购前评分');
            assertContract(!doc.querySelector('a[href*="legacy"]'), '消费者导航仍暴露内部工具');
            assertContract(!doc.querySelector('a[href*="internal"]'), '消费者导航暴露了运维入口');
            assertContract(Boolean(doc.querySelector('.movie-context') && doc.querySelector('.booking-summary')),
                '缺少影片场次上下文或订单摘要');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-002', '票数、推荐连座、报价与继续状态必须一致', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            assertContract(
                doc.querySelector('[data-party-type="couple"]').getAttribute('aria-pressed') === 'true',
                '双人票没有默认使用情侣同行推荐'
            );
            assertContract(
                doc.querySelector('[data-party-type="couple"]').textContent.trim() === '情侣',
                '情侣同行选项未明确呈现'
            );
            assertContract(doc.querySelector('[data-party-type="solo"]').disabled, '两张票仍允许选择单人观影');
            assertContract(doc.querySelector('[data-party-type="group"]').disabled, '两张票仍允许选择多人同行');
            recommend(doc);
            await delay();
            assertContract(!doc.getElementById('seat-decision-guide').hidden, '选座后没有显示座位体验说明');
            assertContract(doc.querySelectorAll('#seat-decision-metrics meter').length === 4, '座位体验缺少四个维度');
            doc.getElementById('toggle-popularity').click();
            await delay();
            assertContract(
                doc.getElementById('toggle-popularity').getAttribute('aria-pressed') === 'true',
                '热度参考开关状态未更新'
            );
            assertContract(doc.getElementById('seat-map').classList.contains('shows-popularity'), '座位图未显示热度参考层');
            assertContract(!doc.getElementById('popularity-legend').hidden, '热度参考缺少文字图例');
            assertContract(!doc.getElementById('seat-heat-canvas').hidden, '连续热度 Canvas 未显示');
            doc.querySelector('[data-heat-period="saturday"]').click();
            await delay(220);
            assertContract(
                doc.querySelector('[data-heat-period="saturday"]').getAttribute('aria-pressed') === 'true',
                '一周热度日期没有即时切换'
            );
            const selected = doc.querySelectorAll('.seat-button.is-selected');
            const total = doc.getElementById('summary-total').textContent;
            assertContract(selected.length === 2, `推荐选择了 ${selected.length} 个座位而非 2 个`);
            assertContract(total.startsWith('¥') && total !== '—', `总价未形成：${total}`);
            assertContract(!doc.getElementById('continue-booking').disabled, '座位选满后继续按钮仍禁用');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-003', '陪同席应联动轮椅位且确认前不能继续', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            doc.querySelector('[data-seat-id="H-02"]').click();
            await delay();
            const selectedIds = [...doc.querySelectorAll('.seat-button.is-selected')].map(item => item.dataset.seatId);
            assertContract(
                selectedIds.includes('H-01') && selectedIds.includes('H-02'),
                `陪同席未联动对应轮椅位：${selectedIds.join(', ')}`
            );
            assertContract(doc.getElementById('continue-booking').disabled, '无障碍用途未确认时仍可继续');
            const acknowledgement = doc.getElementById('accessible-acknowledgement');
            acknowledgement.checked = true;
            acknowledgement.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
            await delay();
            assertContract(!doc.getElementById('continue-booking').disabled, '确认无障碍用途后仍不能继续');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-004', '刷新应恢复有效锁座，关闭后必须释放整组座位', async () => {
        let frame = await createAppFrame();
        try {
            let doc = frame.contentDocument;
            openHold(doc);
            await waitFor(() => doc.getElementById('checkout-dialog').classList.contains('active'), '锁座确认页');
            const stateBefore = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            const held = Object.values(stateBefore.holdsById).find(item => item.status === 'held');
            if (!held) throw new Error('测试准备失败：没有创建 held SeatHold');

            disposeFrame(frame);
            frame = await createAppFrame(1200, true);
            doc = frame.contentDocument;
            await waitFor(
                () => doc.getElementById('checkout-dialog').classList.contains('active'),
                '刷新后恢复锁座确认页'
            );
            const stateRestored = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            assertContract(stateRestored.holdsById[held.id].status === 'held', '刷新后有效 hold 未保持 held');
            assertContract(
                doc.getElementById('hold-countdown')?.textContent.startsWith('剩余'),
                '刷新后未恢复剩余保留时间'
            );
            doc.getElementById('checkout-close').click();
            await delay();
            const stateAfter = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            const released = stateAfter.holdsById[held.id];
            const inventory = stateAfter.inventoriesByShowtime[held.showtimeId];
            assertContract(released.status === 'released', `关闭后的 hold 状态为 ${released.status}`);
            assertContract(
                held.seatIds.every(seatId => !inventory.holdIdsBySeatId[seatId]),
                '关闭确认页后库存仍保留 hold 映射'
            );
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-005', '访客登录确认与重复提交必须只生成一个订单', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            openHold(doc);
            doc.getElementById('confirm-order').click();
            doc.getElementById('auth-switch').click();
            doc.getElementById('auth-username').value = 'browser-contract';
            doc.getElementById('auth-password').value = 'browser123';
            doc.getElementById('auth-name').value = '浏览器契约用户';
            doc.getElementById('auth-email').value = 'contract@example.test';
            doc.getElementById('auth-form').dispatchEvent(new win.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();
            const confirm = doc.getElementById('confirm-order');
            confirm.click();
            confirm.click();
            await delay();
            const stateV3 = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            assertContract(Object.keys(stateV3.ordersById).length === 1, '重复确认创建了多个订单');
            assertContract(doc.querySelector('#checkout-content h2')?.textContent === '购票成功', '未显示购票成功凭证');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-006', '目标视口不得页面级横向溢出，手机座位图应容器内滚动', async () => {
        const frame = await createAppFrame(1440);
        try {
            const failures = [];
            for (const width of [320, 390, 768, 1024, 1440]) {
                frame.style.width = `${width}px`;
                frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('resize'));
                await delay(40);
                const root = frame.contentDocument.documentElement;
                if (root.scrollWidth > root.clientWidth + 1) {
                    failures.push(`${width}px 页面溢出 ${root.scrollWidth} > ${root.clientWidth}`);
                }
                if (width <= 390) {
                    const scroller = frame.contentDocument.getElementById('seat-scroll');
                    if (scroller.scrollWidth <= scroller.clientWidth) {
                        failures.push(`${width}px 座位图没有形成内部滚动区域`);
                    }
                }
            }
            frame.style.width = '1440px';
            frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('resize'));
            frame.contentDocument.documentElement.style.scrollBehavior = 'auto';
            const seatCardTop = frame.contentDocument.querySelector('.seat-card').getBoundingClientRect().top +
                frame.contentWindow.scrollY;
            frame.contentWindow.scrollTo(0, seatCardTop);
            await delay(40);
            const stickyTop = frame.contentDocument.querySelector('.summary-sticky').getBoundingClientRect().top;
            if (stickyTop < 70 || stickyTop > 110) {
                failures.push(`1440px 订单摘要未保持 sticky，top=${Math.round(stickyTop)}`);
            }
            assertContract(failures.length === 0, failures.join('；'));
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-007', '订单取消应确认金额、提交退款并原子释放已售座位', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            const alternateDate = [...doc.querySelectorAll('[data-catalog-type="date"]')]
                .find(button => !button.disabled && button.getAttribute('aria-pressed') !== 'true');
            assertContract(Boolean(alternateDate), '没有可切换的其他营业日');
            alternateDate.click();
            await delay();
            openHold(doc);
            doc.getElementById('confirm-order').click();
            doc.getElementById('auth-switch').click();
            doc.getElementById('auth-username').value = 'refund-contract';
            doc.getElementById('auth-password').value = 'browser123';
            doc.getElementById('auth-name').value = '退票契约用户';
            doc.getElementById('auth-email').value = 'refund@example.test';
            doc.getElementById('auth-form').dispatchEvent(new win.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();
            doc.getElementById('confirm-order').click();
            await waitFor(() => doc.querySelector('#checkout-content .success-ticket'), '订单成功凭证');
            doc.querySelector('.success-ticket .primary-action').click();
            doc.getElementById('btn-orders').click();
            const action = await waitFor(() => doc.querySelector('.order-refund-action'), '订单退票入口');
            assertContract(
                doc.querySelector('.order-ticket-code strong')?.textContent.startsWith('SC-'),
                '我的订单没有提供可再次查看的电子取票码'
            );
            action.click();
            assertContract(
                doc.getElementById('refund-dialog').classList.contains('active'),
                '未展示退票金额确认对话框'
            );
            doc.getElementById('refund-confirm').click();
            await delay();
            const stateV3 = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            const cancelled = Object.values(stateV3.ordersById)[0];
            const inventory = stateV3.inventoriesByShowtime[cancelled.showtimeSnapshot.id];
            assertContract(cancelled.status === 'cancelled', `取消后订单状态为 ${cancelled.status}`);
            assertContract(cancelled.refund.status === 'pending', '退款申请未进入 pending');
            assertContract(
                cancelled.seatSnapshots.every(seat => !inventory.soldSeatIds.includes(seat.id)),
                '退票后座位仍保留在已售库存'
            );
            assertContract(
                doc.querySelector('.order-refund-state')?.textContent.includes('退款处理中'),
                '订单卡片未反馈退款处理状态'
            );
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-008', '并发抢座应移除失效选择并支持一键重新推荐', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            recommend(doc);
            await delay();
            const selectedIds = [...doc.querySelectorAll('.seat-button.is-selected')]
                .map(button => button.dataset.seatId);
            assertContract(selectedIds.length === 2, '测试准备失败：未形成两个推荐座位');
            const stateV3 = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            const showtimeId = doc.querySelector('[data-showtime-id][aria-pressed="true"]').dataset.showtimeId;
            const inventory = stateV3.inventoriesByShowtime[showtimeId];
            inventory.soldSeatIds = [...new Set([...inventory.soldSeatIds, ...selectedIds])];
            inventory.revision++;
            inventory.updatedAt = new Date().toISOString();
            stateV3.revision++;
            stateV3.updatedAt = inventory.updatedAt;
            localStorage.setItem('smartcinema_state_v3', JSON.stringify(stateV3));

            doc.getElementById('continue-booking').click();
            const conflict = await waitFor(() => !doc.getElementById('seat-conflict').hidden, '抢座冲突恢复提示');
            assertContract(Boolean(conflict), '没有显示抢座冲突恢复提示');
            assertContract(doc.querySelectorAll('.seat-button.is-selected').length === 0, '失效座位仍留在草稿');
            assertContract(doc.getElementById('continue-booking').disabled, '冲突后仍允许继续结算');
            assertContract(
                doc.activeElement === doc.getElementById('seat-conflict-recommend'),
                '焦点没有移动到冲突恢复动作'
            );
            doc.getElementById('seat-conflict-recommend').click();
            await delay();
            assertContract(doc.querySelectorAll('.seat-button.is-selected').length === 2, '未重新推荐合法连座');
            assertContract(doc.getElementById('seat-conflict').hidden, '恢复后冲突提示未清除');
            assertContract(!doc.getElementById('continue-booking').disabled, '重新推荐后仍不能继续');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('UX-009', '电影、影院与日期切换应更新上下文并清除旧座位', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            assertContract(doc.querySelectorAll('[data-catalog-type="movie"]').length === 7, '影片目录不是 7 部');
            assertContract(doc.querySelectorAll('[data-catalog-type="cinema"]').length === 3, '影院目录不是 3 家');
            assertContract(doc.querySelectorAll('[data-catalog-type="date"]').length === 3, '营业日目录不是 3 天');
            await waitFor(
                () => doc.getElementById('movie-carousel-status').textContent.includes('/ 7'),
                '影片滑窗报告范围'
            );
            doc.querySelector('[data-carousel-target="movie-list"][data-carousel-direction="next"]').click();
            await delay(220);
            assertContract(doc.getElementById('movie-list').scrollLeft > 0, '影片滑窗右移无效');
            recommend(doc);
            await delay();
            assertContract(doc.querySelectorAll('.seat-button.is-selected').length === 2, '切换前未形成座位选择');

            const alternateCatalogDate = [...doc.querySelectorAll('[data-catalog-type="date"]')]
                .find(button => !button.disabled && button.getAttribute('aria-pressed') !== 'true');
            assertContract(Boolean(alternateCatalogDate), '没有可切换的其他营业日');
            alternateCatalogDate.click();
            await delay();
            assertContract(doc.querySelectorAll('.seat-button.is-selected').length === 0, '切换日期后保留了旧座位');

            doc.querySelector('[data-catalog-value="movie-your-name"]').click();
            await waitFor(
                () => doc.getElementById('poster-image').src.endsWith('/public/images/posters/your-name.jpg'),
                '切换影片后更新本地封面'
            );
            assertContract(doc.getElementById('movie-title').textContent === '你的名字', '切换影片后上下文未更新');
            assertContract(
                doc.getElementById('poster-image').src.endsWith('/public/images/posters/your-name.jpg'),
                '切换影片后没有更新本地封面'
            );
            assertContract(
                doc.getElementById('movie-poster').getAttribute('aria-label') === '你的名字影片封面',
                '影片封面缺少当前影片的无障碍名称'
            );

            doc.querySelector('[data-catalog-value="cinema-riverside"]').click();
            await delay();
            assertContract(doc.getElementById('cinema-name').textContent.includes('清河'), '切换影院后场次上下文未更新');
            assertContract(doc.querySelectorAll('.seat-button').length === 300, '大厅没有渲染 300 个座位');
            assertContract(doc.querySelectorAll('.showtime-option').length === 4, '影片排期没有提供四场可选时间');
            const seatScroller = doc.getElementById('seat-scroll');
            await waitFor(() => {
                const centered = (seatScroller.scrollWidth - seatScroller.clientWidth) / 2;
                return Math.abs(seatScroller.scrollLeft - centered) <= 2;
            }, '300 座影厅首次打开后居中');
            const centeredScrollLeft = (seatScroller.scrollWidth - seatScroller.clientWidth) / 2;
            assertContract(
                Math.abs(seatScroller.scrollLeft - centeredScrollLeft) <= 2,
                '300 座影厅首次打开时没有居中显示'
            );
            await waitFor(
                () => doc.activeElement?.dataset.catalogValue === 'cinema-riverside',
                '目录重绘后归还触发按钮焦点'
            );
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-007', '登录与注册表单必须支持 Enter 提交', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            doc.getElementById('btn-login').click();
            doc.getElementById('auth-username').value = 'missing-user';
            doc.getElementById('auth-password').value = 'valid123';
            doc.getElementById('auth-form').dispatchEvent(new win.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();
            assertContract(doc.getElementById('auth-error').textContent.trim().length > 0, 'Enter 没有触发认证');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-008', '内容拖出与背景点击均不得关闭登录弹窗', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            doc.getElementById('btn-login').click();
            const overlay = doc.getElementById('auth-modal');
            const input = doc.getElementById('auth-username');
            const Pointer = win.PointerEvent || win.MouseEvent;
            input.dispatchEvent(new Pointer('pointerdown', { bubbles: true }));
            overlay.dispatchEvent(new Pointer('pointerup', { bubbles: true }));
            assertContract(overlay.classList.contains('active'), '从输入框拖到遮罩释放后弹窗被关闭');
            overlay.dispatchEvent(new Pointer('pointerdown', { bubbles: true }));
            overlay.dispatchEvent(new Pointer('pointerup', { bubbles: true }));
            assertContract(overlay.classList.contains('active'), '点击背景后登录弹窗被关闭');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('BUG-009', '弹窗必须有关闭键、Escape 与焦点归还', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            const trigger = doc.getElementById('btn-login');
            trigger.focus();
            trigger.click();
            const overlay = doc.getElementById('auth-modal');
            const close = doc.getElementById('auth-modal-close');
            doc.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true
            }));
            assertContract(Boolean(close), '缺少语义关闭按钮');
            assertContract(!overlay.classList.contains('active'), 'Escape 没有关闭弹窗');
            assertContract(doc.activeElement === trigger, '关闭后焦点没有归还触发按钮');

            openHold(doc);
            doc.getElementById('confirm-order').click();
            doc.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true
            }));
            assertContract(!overlay.classList.contains('active'), '叠层中的登录弹窗没有响应 Escape');
            assertContract(
                doc.getElementById('checkout-dialog').classList.contains('active'),
                '关闭登录弹窗时错误地同时关闭了底层锁座确认页'
            );
            doc.getElementById('checkout-close').click();
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('A11Y-001', '座位图应使用单一 Tab 停点、方向键移动与 Space 选择', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            let current = doc.querySelector('.seat-button[tabindex="0"]');
            const before = current.dataset.seatId;
            current.focus();
            current.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'ArrowRight',
                bubbles: true,
                cancelable: true
            }));
            current = doc.activeElement;
            const after = current.dataset.seatId;
            current.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: ' ',
                bubbles: true,
                cancelable: true
            }));
            await delay();
            assertContract(before !== after, '方向键没有移动座位焦点');
            assertContract(doc.querySelectorAll('.seat-button[tabindex="0"]').length === 1, '座位图存在多个 Tab 停点');
            assertContract(doc.querySelectorAll('.seat-button.is-selected').length === 1, 'Space 没有选择座位');
            assertContract(doc.activeElement?.dataset.seatId === after, '选座重绘后键盘焦点丢失');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('A11Y-002', '观影辅助偏好应即时应用并跨刷新持久化', async () => {
        let frame = await createAppFrame();
        try {
            let doc = frame.contentDocument;
            const win = frame.contentWindow;
            doc.getElementById('btn-preferences').click();
            const readable = doc.getElementById('preference-readable');
            const contrast = doc.getElementById('preference-contrast');
            const colorblind = doc.getElementById('preference-colorblind');
            const motion = doc.getElementById('preference-motion');
            [readable, contrast, colorblind, motion].forEach(input => {
                input.checked = true;
                input.dispatchEvent(new win.Event('change', { bubbles: true }));
            });
            assertContract(doc.body.classList.contains('commerce-readable'), '大字体未即时应用');
            assertContract(doc.body.classList.contains('commerce-high-contrast'), '高对比度未即时应用');
            assertContract(doc.body.classList.contains('commerce-colorblind'), '色觉友好模式未即时应用');
            assertContract(doc.documentElement.dataset.commerceMotion === 'reduce', '减少动态效果未即时应用');

            disposeFrame(frame);
            frame = await createAppFrame(1200, true);
            doc = frame.contentDocument;
            assertContract(doc.body.classList.contains('commerce-readable'), '刷新后丢失大字体偏好');
            assertContract(doc.body.classList.contains('commerce-high-contrast'), '刷新后丢失高对比度偏好');
            assertContract(doc.body.classList.contains('commerce-colorblind'), '刷新后丢失色觉友好偏好');
            assertContract(doc.documentElement.dataset.commerceMotion === 'reduce', '刷新后丢失动态偏好');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('SEC-001', '用户可控账户字段必须作为纯文本渲染', async () => {
        const frame = await createAppFrame();
        try {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            const payload = '<img src=x onerror=alert(1)>';
            doc.getElementById('btn-register').click();
            doc.getElementById('auth-username').value = 'safe-render-user';
            doc.getElementById('auth-password').value = 'browser123';
            doc.getElementById('auth-name').value = payload;
            doc.getElementById('auth-email').value = 'safe@example.test';
            doc.getElementById('auth-form').dispatchEvent(new win.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();
            const userInfo = doc.getElementById('user-info');
            assertContract(userInfo.textContent.includes(payload), '用户姓名没有按文本显示');
            assertContract(!userInfo.querySelector('img'), '用户姓名被解释为 HTML');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('ARCH-001', '内部运维入口必须独立、禁止索引且不复用消费者组件树', async () => {
        const response = await fetch('/internal.html');
        assertContract(response.ok, `内部工具响应异常：${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        assertContract(
            doc.querySelector('meta[name="robots"]')?.content === 'noindex,nofollow',
            '内部工具未禁止搜索引擎索引'
        );
        assertContract(Boolean(doc.getElementById('operations-access-gate')), '内部工具缺少权限门');
        assertContract(!doc.querySelector('canvas'), '内部工具仍复用了旧 Canvas 功能仪表盘');
        assertContract(!html.includes('src/app.js'), '内部工具仍依赖旧消费者 UI 入口');
        assertContract(doc.title.includes('放映运维'), '内部工具页面标题缺少清晰职责');
    });

    await regression('OPS-001', '访客与普通会员不得进入内部运维台', async () => {
        let frame = await createOperationsFrame();
        try {
            let doc = frame.contentDocument;
            assertContract(doc.documentElement.dataset.operationsStatus === 'access-gate', '访客绕过了权限门');
            assertContract(doc.getElementById('operations-dashboard').hidden, '访客可见运维数据');
            disposeFrame(frame);

            frame = await createAppFrame(1200, true);
            doc = frame.contentDocument;
            const win = frame.contentWindow;
            doc.getElementById('btn-register').click();
            doc.getElementById('auth-username').value = 'operations-member';
            doc.getElementById('auth-password').value = 'browser123';
            doc.getElementById('auth-name').value = '普通会员';
            doc.getElementById('auth-email').value = 'member@example.test';
            doc.getElementById('auth-form').dispatchEvent(new win.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await waitFor(() => doc.getElementById('user-info').textContent.includes('普通会员'), '会员注册完成');
            disposeFrame(frame);

            frame = await createOperationsFrame(1200, true);
            doc = frame.contentDocument;
            doc.getElementById('operations-username').value = 'operations-member';
            doc.getElementById('operations-password').value = 'browser123';
            doc.getElementById('operations-login-form').dispatchEvent(new frame.contentWindow.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await delay();
            assertContract(doc.documentElement.dataset.operationsStatus === 'access-gate', '普通会员进入了运维台');
            assertContract(doc.getElementById('operations-login-error').textContent.includes('没有内部运维权限'),
                '越权登录没有给出明确反馈');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('OPS-002', '管理员人工释放锁座必须确认并原子更新库存', async () => {
        let frame = await createAppFrame();
        try {
            openHold(frame.contentDocument);
            const before = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            const hold = Object.values(before.holdsById).find(item => item.status === 'held');
            assertContract(Boolean(hold), '消费者入口没有创建有效锁座');
            disposeFrame(frame);

            frame = await createOperationsFrame(1200, true);
            const doc = frame.contentDocument;
            doc.getElementById('operations-username').value = 'admin';
            doc.getElementById('operations-password').value = 'admin123';
            doc.getElementById('operations-login-form').dispatchEvent(new frame.contentWindow.Event('submit', {
                bubbles: true,
                cancelable: true
            }));
            await waitFor(() => doc.documentElement.dataset.operationsStatus === 'dashboard-ready', '管理员运维概览');
            assertContract(doc.getElementById('metric-holds').textContent === '1', '运维概览没有反映有效锁座');

            const release = await waitFor(() => doc.querySelector(`[data-release-hold-id="${hold.id}"]`), '人工释放入口');
            release.click();
            assertContract(doc.getElementById('operations-confirm-dialog').classList.contains('active'),
                '破坏性库存操作没有二次确认');
            doc.getElementById('operations-confirm-action').click();
            await waitFor(() => {
                const current = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
                return current.holdsById[hold.id]?.status === 'released';
            }, '锁座释放完成');

            const after = JSON.parse(localStorage.getItem('smartcinema_state_v3'));
            const inventory = after.inventoriesByShowtime[hold.showtimeId];
            assertContract(hold.seatIds.every(seatId => !inventory.holdIdsBySeatId[seatId]),
                '锁座记录已释放但库存映射仍占用座位');
            assertContract(doc.getElementById('metric-holds').textContent === '0', '释放后运维指标未同步');
        } finally {
            disposeFrame(frame);
        }
    });

    await regression('QA-001', '核心交互过程中不得出现未处理浏览器错误', async () => {
        assertContract(runtimeErrors.length === 0, runtimeErrors.join('；'));
    });

    clearTestStorage();
    const expected = state.pass === 19 && state.xfail === 0 && state.xpass === 0 && state.error === 0;
    status.textContent = expected ? '完成：18 个商业、架构与运维回归，加运行时健康检查全部通过' : '完成：结果与当前预期不一致';
    document.documentElement.dataset.status = 'complete';
    Object.entries(state).forEach(([key, value]) => {
        document.documentElement.dataset[key] = String(value);
    });
}

run().catch(error => {
    state.error++;
    updateSummary();
    status.textContent = `测试运行器失败：${error.message}`;
    document.documentElement.dataset.status = 'runner-error';
});
