/**
 * SmartCinema - 主应用入口
 * 初始化所有模块，管理应用状态和交互
 *
 * 加载顺序: Auth → SeatData → Cinema → Modules → UI Bindings
 */

import { SeatData, HALL_CONFIG } from './core/SeatData.js';
import { Cinema } from './core/Cinema.js';
import { HeatmapEngine } from './modules/HeatmapEngine.js';

import { AIChatbot } from './modules/AIChatbot.js';
import { BrowserSpeechService } from './infrastructure/browser/BrowserSpeechService.js';
import { createBrowserAppController, createBrowserRealtimeSimulator } from './bootstrap.js';
import { AuthViewAdapter } from './ui/adapters/AuthViewAdapter.js';
import { OrderViewAdapter } from './ui/adapters/OrderViewAdapter.js';
import { AccountController } from './ui/controllers/AccountController.js';
import { AccessibilityController } from './ui/controllers/AccessibilityController.js';
import { AdminPanelController } from './ui/controllers/AdminPanelController.js';
import { AuthDialogController } from './ui/controllers/AuthDialogController.js';
import { BackupController } from './ui/controllers/BackupController.js';
import { ChatbotController } from './ui/controllers/ChatbotController.js';
import { OrdersPanelController } from './ui/controllers/OrdersPanelController.js';
import { RecommendationController } from './ui/controllers/RecommendationController.js';
import { ScoringController } from './ui/controllers/ScoringController.js';
import { SettingsController } from './ui/controllers/SettingsController.js';
import { ToastController } from './ui/components/ToastController.js';
import { snapshotSeatData } from './ui/adapters/SeatDataLayoutAdapter.js';
import { SeatDataProjection } from './ui/adapters/SeatDataProjection.js';

class SmartCinema {
    constructor() {
        // 座位数据（默认中厅）
        this.seatData = new SeatData('medium');

        // 应用组合根（最先建立业务状态）
        this.controller = createBrowserAppController();
        const initialized = this.controller.initialize(this._getShowtimeId());
        if (!initialized.ok) {
            throw new Error(`SmartCinema 初始化失败：${initialized.error.message}`);
        }
        this.auth = new AuthViewAdapter(this.controller);
        this.orderManager = new OrderViewAdapter(this.controller);
        this.seatProjection = new SeatDataProjection({
            seatData: this.seatData,
            getState: () => this.controller.getState(),
            replaceSelection: seatKeys => this.controller.replaceSelection(seatKeys)
        });

        this.a11yManager = new AccessibilityController({
            document,
            browserWindow: window,
            speechService: new BrowserSpeechService({
                speechSynthesis: window.speechSynthesis,
                SpeechSynthesisUtterance: window.SpeechSynthesisUtterance
            }),
            scheduler: window
        });

        // AI 顾问
        this.chatbot = new AIChatbot(this.seatData);

        // DOM 引用
        this.cinemaCanvas = document.getElementById('cinema-canvas');
        this.hallSelector = document.getElementById('hall-selector');
        this.heatmapCanvas = document.getElementById('heatmap-canvas');
        this.toast = new ToastController({ document, scheduler: window });
        this.authDialog = new AuthDialogController({
            auth: this.auth,
            onAuthChanged: () => {
                this.updateAuthUI();
                this.loadSettings();
            },
            onAnnounce: message => this.a11yManager.announce(message),
            onNotify: message => this.toast.show(message)
        });
        this.adminPanel = new AdminPanelController({
            auth: this.auth,
            orderManager: this.orderManager,
            document,
            notify: message => window.alert(message)
        });
        this.accountController = new AccountController({
            auth: this.auth,
            document,
            confirmAction: message => window.confirm(message),
            notify: message => window.alert(message),
            onOpenAuth: (mode, trigger) => this.showAuthModal(mode, trigger),
            onOpenAdmin: trigger => this.adminPanel.open(trigger),
            onAuthChanged: () => {
                this.loadSettings();
                this.updateSubmitButton();
            },
            onAnnounce: message => this.a11yManager.announce(message)
        });
        this.chatbotController = new ChatbotController({
            chatbot: this.chatbot,
            document,
            getSeatData: () => this.seatData,
            scheduler: window
        });
        this.backupController = new BackupController({
            controller: this.controller,
            document,
            browserWindow: window
        });

        // 渲染引擎
        this.cinema = new Cinema(this.cinemaCanvas, this.seatData);
        this.heatmap = this.heatmapCanvas ? new HeatmapEngine(this.heatmapCanvas, this.seatData) : null;

        // WebSocket 事件模拟器：只产生事件，不直接修改 SeatData/Canvas。
        this.realtime = createBrowserRealtimeSimulator({
            getContext: () => this._getRealtimeContext(),
            interval: 6000,
            onEvent: event => this._onRealtimeEvent(event)
        });
        this.settingsController = new SettingsController({
            controller: this.controller,
            document,
            a11yManager: this.a11yManager,
            cinema: this.cinema,
            realtime: this.realtime,
            onExport: () => this.handleExport(),
            onImport: () => this.handleImport(),
            onError: message => this.toast.show(message)
        });
        this.ordersPanel = new OrdersPanelController({
            orderManager: this.orderManager,
            document,
            confirmAction: message => window.confirm(message),
            notify: message => window.alert(message),
            onCancelled: order => this._refreshAfterOrderCancellation(order),
            onAnnounce: message => this.a11yManager.announce(message)
        });
        this.recommendationController = new RecommendationController({
            controller: this.controller,
            document,
            getSeatLayout: () => snapshotSeatData(this.seatData),
            requireAuth: () => this.requireAuth(),
            onPreview: seats => this._previewRecommendation(seats),
            onApply: seats => this._applyRecommendedSeats(seats),
            onError: message => window.alert(message)
        });
        this.scoringController = new ScoringController({
            controller: this.controller,
            document,
            getSeatLayout: () => snapshotSeatData(this.seatData),
            onError: message => this.toast.show(message)
        });

        // 状态
        this.applyPersistedSoldSeats();
        this.cinema.redraw();
        this.updateHeatmap();

        // 绑定事件
        this.bindEvents();

        // 初始化UI
        this.updateAuthUI();
        this.updateUI();
        this.loadSettings();

        console.log('SmartCinema initialized | Hall:', this.seatData.hallType,
            '| Auth:', this.auth.isLoggedIn() ? this.auth.getCurrentUser().username : 'none');
    }

    /* ================================================================
     * 事件绑定
     * ================================================================ */

    bindEvents() {
        this.a11yManager.bind();
        this.settingsController.bind();
        this.ordersPanel.bind();
        this.recommendationController.bind();
        this.scoringController.bind();
        this.accountController.bind();
        this.chatbotController.bind();

        // Canvas 座位选择变更
        this.cinemaCanvas.addEventListener('selectionChange', (e) => {
            this.onSelectionChange(e.detail);
        });

        // 放映厅切换
        if (this.hallSelector) {
            this.hallSelector.addEventListener('change', (e) => {
                this.switchHall(e.target.value);
            });
        }

        // ★ 日期切换（热度图动态变化）
        document.getElementById('day-selector')?.addEventListener('change', (e) => {
            this.switchDay(parseInt(e.target.value));
        });

        // ★ 提交订单 → 跳转独立页面
        document.getElementById('btn-submit-order')?.addEventListener('click', () => {
            this.handleSubmitOrder();
        });

        // 清空选择
        document.getElementById('clear-selection')?.addEventListener('click', () => {
            this.handleClear();
        });

        // 智能推荐按钮
        document.getElementById('smart-recommend')?.addEventListener('click', () => {
            document.getElementById('recommend-panel')?.scrollIntoView({ behavior: 'smooth' });
        });

        // 手动选座按钮
        document.getElementById('manual-select')?.addEventListener('click', () => {
            this.cinemaCanvas.scrollIntoView({ behavior: 'smooth' });
        });

        // 窗口缩放
        window.addEventListener('resize', () => {
            this.cinema.resize();
            this.updateHeatmap();
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || this._isEditableTarget(e.target)) return;
            const key = e.key.toLowerCase();
            if (key === 'e') {
                e.preventDefault();
                this.handleExport();
            } else if (key === 'i') {
                e.preventDefault();
                this.handleImport();
            }
        });
    }

    /* ================================================================
     * 放映厅切换
     * ================================================================ */

    switchHall(hallType) {
        if (!HALL_CONFIG[hallType]) return;

        // 保存当前状态
        this.saveToStorage();

        const dayIndex = this._getDayIndex();

        // 切换数据层
        this.seatData.switchHall(hallType, dayIndex);
        this.controller.changeShowtime(this._getShowtimeId(hallType, dayIndex));
        this.applyPersistedSoldSeats();

        // ★ 复用现有渲染实例，不创建新的 —— 避免多实例事件监听器叠加
        this.cinema.sd = this.seatData;
        this.cinema.relayout();
        this.cinema.redraw();
        this.updateHeatmap();

        // 更新UI
        this.updateUI();
        this.updateScore();

        this.recommendationController.clear();

        // 更新放映厅名称
        const nameEl1 = document.getElementById('hall-name-display');
        if (nameEl1) nameEl1.textContent = HALL_CONFIG[hallType].name;

        this.a11yManager.announce(`已切换到${HALL_CONFIG[hallType].name}`);
    }

    /** 切换日期（热度图动态变化） */
    switchDay(dayIndex) {
        this.seatData.switchDay(dayIndex);
        this.controller.changeShowtime(this._getShowtimeId(this.seatData.hallType, dayIndex));
        this.applyPersistedSoldSeats();
        this.cinema.sd = this.seatData;
        this.cinema.relayout();
        this.cinema.redraw();
        this.updateHeatmap();
        this.updateUI();
        this.updateScore();
        this.recommendationController.clear();

        const days = ['周一','周二','周三','周四','周五','周六','周日'];
        this.a11yManager.announce(`已切换到${days[dayIndex]}`);
    }

    /* ================================================================
     * 选座 & 推荐
     * ================================================================ */

    onSelectionChange(detail) {
        const seatKeys = detail.selectedSeats.map(seat => `${seat.row}-${seat.col}`);
        const synced = this.controller.replaceSelection(seatKeys);
        if (!synced.ok) {
            this._restoreSelectionFromController();
            this.cinema.redraw();
            this.a11yManager.announce(synced.error.message);
        }
        this.updateStats(this.seatData.getStats());
        this.updateScore();
        this.updateSubmitButton();
        this.updateHeatmap();
    }

    _previewRecommendation(seats) {
        this.seatData.clearRecommended();
        this.seatData.setRecommended(seats);
        this.cinema.redraw();
        this.updateHeatmap();
    }

    _applyRecommendedSeats(seats) {
        this.seatData.clearSelection();
        seats.forEach(seat => {
            this.seatData.selectSeat(seat.row, seat.col);
        });
        this.cinema.redraw();
        this.updateHeatmap();
        this.updateUI();
        this.updateScore();
        this.saveToStorage();
    }

    handleClear() {
        this.seatData.clearSelection();
        this.seatData.clearRecommended();
        this.recommendationController.clear();
        this.cinema.redraw();
        this.updateHeatmap();
        this.updateUI();
        this.updateScore();
        this.saveToStorage();
    }

    /* ================================================================
     * 评分
     * ================================================================ */

    updateScore() {
        return this.scoringController.update();
    }

    /* ================================================================
     * 订单：提交到独立确认页
     * ================================================================ */

    /** 更新提交订单按钮状态和摘要 */
    updateSubmitButton() {
        this.ordersPanel.updateCheckoutSummary(
            this.seatData.getSelectedSeats(),
            this.auth.isLoggedIn()
        );
    }

    /** 提交订单 → 跳转独立确认页 */
    handleSubmitOrder() {
        if (!this.requireAuth()) return;

        const selected = this.seatData.getSelectedSeats();
        if (selected.length === 0) {
            alert('请先选择座位');
            return;
        }

        const checkout = this.controller.startCheckout({
            showtimeId: this._getShowtimeId(),
            seats: selected.map(seat => ({
                seatKey: `${seat.row}-${seat.col}`,
                row: seat.row,
                col: seat.col,
                unitPrice: seat.price
            }))
        });
        if (!checkout.ok) {
            alert(checkout.error.message);
            this.applyPersistedSoldSeats();
            this.cinema.redraw();
            return;
        }
        window.location.href = 'order.html';
    }

    _refreshAfterOrderCancellation(order) {
        const hallType = order.hallType || this.seatData.hallType;
        if (hallType === this.seatData.hallType && order.dayIndex === this._getDayIndex()) {
            const dayIndex = this._getDayIndex();
            this.seatData.switchDay(dayIndex);
            this.applyPersistedSoldSeats();
            this.cinema.sd = this.seatData;
            this.cinema.relayout();
            this.cinema.redraw();
            this.updateHeatmap();
            this.updateUI();
            this.updateScore();
        }
    }

    /* ================================================================
     * 认证
     * ================================================================ */

    /** 需要登录才能继续的操作 */
    requireAuth() {
        return this.accountController.requireAuth();
    }

    showAuthModal(mode, trigger = null) {
        this.authDialog.open(mode, trigger);
    }

    updateAuthUI() {
        this.accountController.render();
        this.updateSubmitButton();
    }

    /* ================================================================
     * UI 更新
     * ================================================================ */

    updateUI() {
        const stats = this.seatData.getStats();
        this.updateStats(stats);
        this.updateSubmitButton();
    }

    updateStats(stats) {
        this._setText('selected-count', stats.selected);
        this._setText('available-count', stats.available);
        this._setText('sold-count', stats.occupied);

        // 更新放映厅名称
        const hallName = document.getElementById('hall-name-display');
        if (hallName) {
            hallName.textContent = HALL_CONFIG[this.seatData.hallType].name;
        }
    }

    updateHeatmap() {
        if (!this.heatmap) return;
        this.heatmap.seatData = this.seatData;
        this.heatmap.reload();
    }

    /* ================================================================
     * 实时模拟（模拟WebSocket）
     * ================================================================ */
    _onRealtimeEvent(evt) {
        if (evt.type === 'purchase') {
            const purchased = this.controller.applyRemotePurchase(evt);
            if (!purchased.ok) return;
            if (evt.showtimeId === this.controller.getState().showtimeId) {
                this.applyPersistedSoldSeats();
            }
            this.toast.show(`🔔 ${evt.ownerLabel} 刚刚购买了 ${this._seatLabel(evt.seatKey)}`);
        } else {
            const held = this.controller.applyRemoteHold(evt);
            if (!held.ok || evt.showtimeId !== this.controller.getState().showtimeId) return;
            this._projectRemoteHolds();
            if (evt.type === 'hold') {
                this.toast.show(`👆 ${evt.ownerLabel} 正在查看 ${this._seatLabel(evt.seatKey)}`);
            }
        }
        this.cinema.redraw();
        this.updateUI();
    }

    loadSettings() {
        return this.settingsController.load();
    }

    applyPersistedSoldSeats() {
        this.seatProjection.projectPersistedState();
    }

    _projectRemoteHolds() {
        this.seatProjection.projectRemoteHolds();
    }

    _restoreSelectionFromController() {
        this.seatProjection.restoreSelection();
    }

    saveToStorage() {
        return this.seatProjection.syncSelection();
    }

    handleExport() {
        return this.backupController.export();
    }

    handleImport() {
        return this.backupController.import();
    }

    /* ================================================================
     * 工具
     * ================================================================ */

    _setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    _getDayIndex() {
        const value = Number.parseInt(document.getElementById('day-selector')?.value, 10);
        return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 3;
    }

    _getShowtimeId(hallType = this.seatData.hallType, dayIndex = this._getDayIndex()) {
        return `${hallType}:day:${dayIndex}`;
    }

    _getRealtimeContext() {
        return {
            showtimeId: this._getShowtimeId(),
            availableSeatKeys: this.seatProjection.availableSeatKeys()
        };
    }

    _seatLabel(seatKey) {
        const [row, col] = seatKey.split('-').map(Number);
        return `${row + 1}排${col + 1}座`;
    }

    _isEditableTarget(target) {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    }
}

// 全局实例
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new SmartCinema();
    // 暴露只读入口，供浏览器回归与本地诊断使用。
    window.app = app;
    console.log('🎬 SmartCinema ready');
});

export default SmartCinema;
