import { createBrowserAppController } from './bootstrap.js';
import { HALL_CONFIG } from './core/SeatData.js';
import { parseShowtimeId } from './domain/cinema/Showtime.js';

const controller = createBrowserAppController();
const initialized = controller.initialize();
const container = document.getElementById('order-container');
const toast = document.getElementById('order-toast');
const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
let submitting = false;
let toastTimer = null;

function createElement(tagName, { className = '', text = '', attributes = {} } = {}) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
}

function applySavedAppearance() {
    if (!initialized.ok) return;
    const settings = controller.getState()?.settings;
    document.body.classList.toggle('dark-mode', settings?.theme !== 'light');
    if (settings?.accentColor) document.documentElement.style.setProperty('--accent', settings.accentColor);
}

function showToast(message, kind = 'success') {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.dataset.visible = 'true';
    toastTimer = window.setTimeout(() => {
        toast.dataset.visible = 'false';
    }, 2400);
}

function createInfoList(rows) {
    const list = createElement('dl', { className: 'checkout-info-list' });
    rows.forEach(([label, value]) => {
        const row = createElement('div', { className: 'checkout-info-row' });
        row.append(
            createElement('dt', { text: label }),
            createElement('dd', { text: value })
        );
        list.appendChild(row);
    });
    return list;
}

function createSection(title, content) {
    const section = createElement('section', { className: 'checkout-section' });
    section.append(createElement('h2', { text: title }), content);
    return section;
}

function renderEmpty(message = '暂无待确认的订单') {
    const card = createElement('article', { className: 'checkout-card checkout-empty' });
    const link = createElement('a', {
        className: 'btn btn-primary',
        text: '返回选座',
        attributes: { href: 'index.html' }
    });
    card.append(
        createElement('span', { className: 'checkout-empty-mark', text: 'SC', attributes: { 'aria-hidden': 'true' } }),
        createElement('h1', { text: '无法继续结算' }),
        createElement('p', { text: message }),
        link
    );
    container.replaceChildren(card);
}

function createCheckoutCard(intent) {
    const showtime = parseShowtimeId(intent.showtimeId);
    const hall = HALL_CONFIG[showtime.hallType];
    const user = controller.getCurrentUser();
    controller.changeShowtime(intent.showtimeId);

    const totalPrice = intent.seats.reduce((sum, seat) => sum + seat.unitPrice, 0);
    const averagePrice = Math.round(totalPrice / intent.seats.length);
    const card = createElement('article', { className: 'checkout-card' });
    const header = createElement('header', { className: 'checkout-header' });
    header.append(
        createElement('p', { className: 'checkout-eyebrow', text: 'Checkout' }),
        createElement('h1', { text: '确认订单' }),
        createElement('p', {
            className: 'checkout-subtitle',
            text: `${hall.name} · ${hall.desc} · 周${DAY_LABELS[showtime.dayIndex]}`
        })
    );

    const body = createElement('div', { className: 'checkout-body' });
    const userRows = [
        ['用户名', user?.username || '未登录'],
        ['姓名', user?.name || '-']
    ];
    if (user?.email) userRows.push(['邮箱', user.email]);

    const seatList = createElement('ul', { className: 'checkout-seat-list' });
    intent.seats.forEach(seat => {
        seatList.appendChild(createElement('li', {
            className: 'checkout-seat-chip',
            text: `${seat.row + 1}排${seat.col + 1}座 · ¥${seat.unitPrice}`
        }));
    });

    const costRows = createInfoList([
        ['平均票价', `¥${averagePrice} / 张`],
        ['票数', `${intent.seats.length} 张`]
    ]);
    const total = createElement('div', { className: 'checkout-total' });
    total.append(
        createElement('span', { text: '应付金额' }),
        createElement('strong', { text: `¥${totalPrice}` })
    );

    const actions = createElement('div', { className: 'checkout-actions' });
    const cancelButton = createElement('button', {
        className: 'btn btn-danger',
        text: '取消并返回',
        attributes: { id: 'btn-cancel', type: 'button' }
    });
    const confirmButton = createElement('button', {
        className: 'btn btn-primary',
        text: '确认支付',
        attributes: { id: 'btn-confirm', type: 'button' }
    });
    actions.append(cancelButton, confirmButton);

    body.append(
        createSection('用户信息', createInfoList(userRows)),
        createSection(`选中座位 · ${intent.seats.length} 张`, seatList),
        createSection('费用明细', costRows),
        total,
        actions
    );
    card.append(header, body);

    confirmButton.addEventListener('click', () => confirmOrder(confirmButton));
    cancelButton.addEventListener('click', cancelOrder);
    return card;
}

function confirmOrder(button) {
    if (submitting) return;
    submitting = true;
    button.disabled = true;
    button.textContent = '正在确认…';

    const confirmed = controller.confirmCheckout();
    if (!confirmed.ok) {
        submitting = false;
        button.disabled = false;
        button.textContent = '确认支付';
        showToast(`确认失败：${confirmed.error.message}`, 'error');
        return;
    }

    controller.clearCheckoutIntent();
    showToast(confirmed.value.duplicate ? '订单已确认，正在返回' : '订单确认成功，正在返回');
    window.setTimeout(() => {
        window.location.href = 'index.html';
    }, 700);
}

function cancelOrder() {
    if (submitting) return;
    controller.clearCheckoutIntent();
    window.location.href = 'index.html';
}

function render() {
    applySavedAppearance();
    if (!initialized.ok) {
        renderEmpty(`应用初始化失败：${initialized.error.message}`);
        return;
    }

    const intentResult = controller.getCheckoutIntent();
    if (!intentResult.ok) {
        renderEmpty();
        return;
    }
    container.replaceChildren(createCheckoutCard(intentResult.value));
}

render();
