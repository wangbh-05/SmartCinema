/**
 * SmartCinema - 主应用入口
 * 初始化所有模块，管理应用状态和交互
 *
 * 加载顺序: Auth → SeatData → Cinema → Modules → UI Bindings
 */

import { SeatData, HALL_CONFIG, SEAT_STATUS } from './core/SeatData.js';
import { Cinema } from './core/Cinema.js';
import { RecommendEngine } from './modules/RecommendEngine.js';
import { ScoreEngine } from './modules/ScoreEngine.js';
import { HeatmapEngine } from './modules/HeatmapEngine.js';

import { AIChatbot } from './modules/AIChatbot.js';
import { AccessibilityManager } from './utils/accessibility.js';
import { createBrowserAppController, createBrowserRealtimeSimulator } from './bootstrap.js';
import { LegacyAuthFacade } from './ui/legacy/LegacyAuthFacade.js';
import { LegacyOrderFacade } from './ui/legacy/LegacyOrderFacade.js';
import { AuthDialogController } from './ui/controllers/AuthDialogController.js';
import { OrdersPanelController } from './ui/controllers/OrdersPanelController.js';
import { SettingsController } from './ui/controllers/SettingsController.js';
import { ToastController } from './ui/components/ToastController.js';

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
        this.auth = new LegacyAuthFacade(this.controller);
        this.orderManager = new LegacyOrderFacade(this.controller);

        // 引擎
        this.recommendEngine = new RecommendEngine(this.seatData);
        this.scoreEngine = new ScoreEngine(this.seatData);
        this.a11yManager = new AccessibilityManager();

        // AI 顾问
        this.chatbot = new AIChatbot(this.seatData);

        // DOM 引用
        this.cinemaCanvas = document.getElementById('cinema-canvas');
        this.recommendForm = document.getElementById('recommend-form');
        this.hallSelector = document.getElementById('hall-selector');
        this.loginBtn = document.getElementById('btn-login');
        this.registerBtn = document.getElementById('btn-register');
        this.logoutBtn = document.getElementById('btn-logout');
        this.adminBtn = document.getElementById('btn-admin');
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

        // 状态
        this.applyPersistedSoldSeats();
        this.restoreSeatSelection();
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
        this.settingsController.bind();
        this.ordersPanel.bind();

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

        // 推荐表单
        if (this.recommendForm) {
            this.recommendForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRecommend();
            });
        }

        // ★ 级联：人数变更 → 更新年龄段选择方式和观影类型选项
        const groupSizeInput = document.getElementById('group-size');
        if (groupSizeInput) {
            groupSizeInput.addEventListener('change', () => this.updateRecommendForm());
            groupSizeInput.addEventListener('input', () => this.updateRecommendForm());
            this.updateRecommendForm(); // 初始化
        }

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

        // 认证事件
        this.loginBtn?.addEventListener('click', () => this.showAuthModal('login', this.loginBtn));
        this.registerBtn?.addEventListener('click', () => this.showAuthModal('register', this.registerBtn));
        this.logoutBtn?.addEventListener('click', () => this.handleLogout());
        this.adminBtn?.addEventListener('click', () => this.showAdminPanel());

        // 窗口缩放
        window.addEventListener('resize', () => {
            this.cinema.resize();
            this.updateHeatmap();
        });

        // ★ AI 观影顾问
        document.getElementById('ai-chat-toggle')?.addEventListener('click', () => this.toggleChatbot());
        document.getElementById('ai-chat-close')?.addEventListener('click', () => this.toggleChatbot(false));
        document.getElementById('ai-chat-send')?.addEventListener('click', () => this.sendChatMessage());
        document.getElementById('ai-chat-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
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
        this.recommendEngine = new RecommendEngine(this.seatData);
        this.scoreEngine = new ScoreEngine(this.seatData);

        // ★ 复用现有渲染实例，不创建新的 —— 避免多实例事件监听器叠加
        this.cinema.sd = this.seatData;
        this.cinema.relayout();
        this.cinema.redraw();
        this.updateHeatmap();

        // 更新UI
        this.updateUI();
        this.updateScore();

        // 清空推荐结果
        const resultDiv = document.getElementById('recommend-result');
        if (resultDiv) { resultDiv.innerHTML = ''; resultDiv.classList.remove('active'); }

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

    /* ================================================================
     * 级联推荐表单
     * ================================================================ */

    /** 根据人数动态更新年龄段选择方式和观影类型选项 */
    updateRecommendForm() {
        const groupSize = parseInt(document.getElementById('group-size')?.value) || 1;
        const multiAge = groupSize >= 2;

        // 切换年龄段选择方式
        const selContainer = document.getElementById('age-select-container');
        const chkContainer = document.getElementById('age-check-container');
        if (selContainer) selContainer.style.display = multiAge ? 'none' : 'block';
        if (chkContainer) chkContainer.style.display = multiAge ? 'block' : 'none';

        // 切换姓名输入方式
        const nameSingle = document.getElementById('name-single-wrapper');
        const nameGroup = document.getElementById('name-group-wrapper');
        const hint = document.getElementById('member-count-hint');
        if (nameSingle) nameSingle.style.display = multiAge ? 'none' : 'block';
        if (nameGroup) nameGroup.style.display = multiAge ? 'block' : 'none';
        if (hint) hint.textContent = groupSize;

        // 动态更新观影类型
        const movieSelect = document.getElementById('movie-type');
        if (!movieSelect) return;

        let options = [{v:'',t:'-- 选择类型 --'}];
        if (groupSize === 1) {
            options.push({v:'solo', t:'🎬 个人观影'});
        } else if (groupSize === 2) {
            options.push({v:'couple', t:'💑 情侣'});
            options.push({v:'friends', t:'👫 朋友'});
            options.push({v:'parent_child', t:'👨‍👧 亲子'});
        } else if (groupSize >= 3 && groupSize <= 4) {
            options.push({v:'family', t:'👨‍👩‍👧 家庭'});
            options.push({v:'friends', t:'👫 朋友'});
        } else if (groupSize === 5) {
            options.push({v:'family', t:'👨‍👩‍👧 家庭'});
            options.push({v:'group', t:'👥 团体'});
            options.push({v:'friends', t:'👫 朋友'});
        } else {
            options.push({v:'group', t:'👥 团体'});
            options.push({v:'friends', t:'👫 朋友'});
        }

        movieSelect.innerHTML = options.map(o =>
            `<option value="${o.v}">${o.t}</option>`
        ).join('');
    }

    /** 获取当前选择的年龄段（支持多选） */
    _getSelectedAges() {
        const multiAge = parseInt(document.getElementById('group-size')?.value) >= 2;
        if (multiAge) {
            const checks = document.querySelectorAll('.age-check:checked');
            if (checks.length === 0) return '';
            return Array.from(checks).map(c => c.value).join(',');
        }
        return document.getElementById('age-group')?.value || '';
    }

    handleRecommend() {
        if (!this.requireAuth()) return;

        const ageGroup = this._getSelectedAges();
        const groupSize = parseInt(document.getElementById('group-size')?.value);
        const movieType = document.getElementById('movie-type')?.value;

        if (!ageGroup || !movieType || isNaN(groupSize) || groupSize < 1) {
            alert('请填写完整的推荐参数（人数→年龄段→观影类型→姓名）');
            return;
        }

        // 收集姓名
        let userNames = [];
        if (groupSize === 1) {
            const name = document.getElementById('user-name')?.value?.trim();
            if (!name) { alert('请输入您的姓名'); return; }
            userNames = [name];
        } else {
            const raw = document.getElementById('member-names')?.value?.trim();
            if (!raw) { alert('请输入成员姓名'); return; }
            userNames = raw.split('\n').map(s => s.trim()).filter(Boolean);
            if (userNames.length < groupSize) {
                alert(`请输入至少 ${groupSize} 位成员的姓名（当前 ${userNames.length} 人）`);
                return;
            }
        }

        const result = this.recommendEngine.recommend(ageGroup, groupSize, movieType);

        if (!result.success) {
            alert(result.message);
            return;
        }

        // 高亮推荐座位
        this.seatData.clearRecommended();
        this.seatData.setRecommended(result.seats);

        // 显示推荐结果
        const resultDiv = document.getElementById('recommend-result');
        if (resultDiv) {
            const nameLabel = groupSize === 1 ? userNames[0] : userNames.join('、');
            resultDiv.innerHTML = `
                <h4>🎯 推荐结果</h4>
                <p>👤 ${nameLabel}</p>
                <p>${result.reason.replace(/\n/g, '<br>')}</p>
                <button class="btn btn-primary" id="btn-apply-recommend">
                    ✓ 应用推荐
                </button>
            `;
            resultDiv.classList.add('active');
            document.getElementById('btn-apply-recommend')?.addEventListener('click', () => {
                this.applyRecommendation();
            });
        }

        this.cinema.redraw();
        this.updateHeatmap();
    }

    applyRecommendation() {
        this.seatData.clearSelection();
        const recommended = this.seatData.getRecommendedSeats();
        recommended.forEach(seat => {
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
        const combined = document.getElementById('combined-score-result');
        if (combined) {
            combined.style.display = 'none';
            combined.innerHTML = '';
        }
        const result = this.scoreEngine.calculateScore();
        const scoreDiv = document.getElementById('score-details');
        const manualPanel = document.getElementById('manual-score-panel');
        if (!scoreDiv) return;

        if (result.totalScore === 0) {
            scoreDiv.innerHTML = '<p class="score-placeholder">请先选择座位，系统将为您计算观影体验评分</p>';
            if (manualPanel) manualPanel.style.display = 'none';
            return;
        }

        // 显示手动评分面板
        if (manualPanel) { manualPanel.style.display = 'block'; this._bindManualScore(); }

        const gradeColor = result.grade === 'excellent' ? '#FFD700' : result.grade === 'good' ? '#58A6FF' : '#8B949E';

        let html = `
            <div class="score-total-row" style="text-align:center;padding:12px 0;border-bottom:1px solid #30363D;margin-bottom:12px;">
                <span id="score-anim-num" style="font-size:2em;font-weight:700;color:${gradeColor};">0</span>
                <span style="font-size:0.9em;color:#8B949E;"> / 100</span>
                <span style="display:inline-block;margin-left:12px;font-size:1.3em;font-weight:700;color:${gradeColor};">${result.gradeText}</span>
            </div>
            <div class="score-detail-rows" style="font-size:0.88em;line-height:2;">`;

        result.details.forEach(d => {
            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                    <span>${d.emoji} ${d.category}</span>
                    <span style="display:flex;align-items:center;gap:8px;">
                        <span style="color:#8B949E;font-size:0.85em;">${d.description}</span>
                        <span style="font-weight:600;color:#C9D1D9;">${d.score} / ${d.maxScore}</span>
                    </span>
                </div>`;
        });

        html += '</div>';

        // 改进建议
        if (result.recommendations && result.recommendations.length > 0) {
            html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #30363D;">';
            result.recommendations.forEach(r => {
                html += `<p style="font-size:0.82em;color:#8B949E;margin:4px 0;">${r.message}</p>`;
            });
            html += '</div>';
        }

        scoreDiv.innerHTML = html;

        // 数字滚动动画
        this._animateScoreNum(result.totalScore);
    }

    /** 评分数字滚动动画 */
    _animateScoreNum(target) {
        const el = document.getElementById('score-anim-num');
        if (!el) return;
        const start = performance.now();
        const duration = 400;
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            // easeOutCubic
            const val = Math.round(target * (1 - Math.pow(1 - t, 3)));
            el.textContent = val;
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /** 绑定手动评分滑块（仅首次） */
    _bindManualScore() {
        if (this._manualScoreBound) return;
        this._manualScoreBound = true;

        const sliders = ['vision','distance','comfort','price'];
        sliders.forEach(key => {
            const el = document.getElementById(`manual-${key}`);
            const valEl = document.getElementById(`manual-${key}-val`);
            if (el && valEl) {
                el.addEventListener('input', () => { valEl.textContent = el.value; });
            }
        });

        document.getElementById('btn-submit-score')?.addEventListener('click', () => {
            this._submitManualScore();
        });
    }

    /** 提交手动评分并显示综合结果 */
    _submitManualScore() {
        const system = this.scoreEngine.calculateScore();
        if (system.totalScore === 0) return;

        const uVision = parseFloat(document.getElementById('manual-vision')?.value) || 5;
        const uDist = parseFloat(document.getElementById('manual-distance')?.value) || 5;
        const uComfort = parseFloat(document.getElementById('manual-comfort')?.value) || 5;
        const uPrice = parseFloat(document.getElementById('manual-price')?.value) || 5;

        // 用户评分（相同权重）
        const userOverall = uVision * 0.35 + uDist * 0.30 + uComfort * 0.20 + uPrice * 0.15;
        const userTotal = Math.round(userOverall * 10);

        // 综合：系统60% + 用户40%
        const combined = Math.round(system.totalScore * 0.6 + userTotal * 0.4);
        const grade = combined >= 80 ? '极佳' : combined >= 60 ? '优秀' : '一般';

        const div = document.getElementById('combined-score-result');
        if (div) {
            div.style.display = 'block';
            div.innerHTML = `
                <div style="margin-bottom:6px;font-size:0.85em;color:var(--text-secondary);">
                    系统评分 <b>${system.totalScore}</b> · 我的评分 <b>${userTotal}</b>
                </div>
                <div style="font-size:1.3em;font-weight:700;color:#FDD835;">
                    ⭐ 综合评分：${combined} / 100 · ${grade}
                </div>`;
        }
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

    /** 迷你订单历史（侧边栏） */
    toggleOrdersMini() {
        return this.ordersPanel.toggle();
    }

    _renderOrdersMini() {
        return this.ordersPanel.render();
    }

    handleCancelOrder(orderId) {
        return this.ordersPanel.cancel(orderId);
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

    showOrderReceipt(orderId) {
        return this.ordersPanel.showReceipt(orderId);
    }

    /* ================================================================
     * 认证
     * ================================================================ */

    /** 需要登录才能继续的操作 */
    requireAuth() {
        if (!this.auth.isLoggedIn()) {
            alert('请先登录后再操作');
            this.showAuthModal('login');
            return false;
        }
        return true;
    }

    showAuthModal(mode, trigger = null) {
        this.authDialog.open(mode, trigger);
    }

    hideAuthModal() {
        this.authDialog.close();
    }

    handleAuthSubmit() {
        return this.authDialog.submit();
    }

    showAuthError(msg) {
        this.authDialog.showError(msg);
    }

    handleLogout() {
        if (confirm('确定要退出登录吗？')) {
            this.auth.logout();
            this.updateAuthUI();
            this.loadSettings();
            this.a11yManager.announce('已退出登录');
        }
    }

    updateAuthUI() {
        const loggedIn = this.auth.isLoggedIn();
        const isAdmin = this.auth.isAdmin();
        const user = this.auth.getCurrentUser();

        // 按钮显示/隐藏
        this._toggleEl(this.loginBtn, !loggedIn);
        this._toggleEl(this.registerBtn, !loggedIn);
        this._toggleEl(this.logoutBtn, loggedIn);
        this._toggleEl(this.adminBtn, isAdmin);

        // 用户信息显示
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
            if (loggedIn && user) {
                userInfo.innerHTML = `<span>👤 ${user.name}</span>
                    <span class="badge badge-${isAdmin ? 'primary' : 'success'}">${isAdmin ? '管理员' : '会员'}</span>`;
                userInfo.style.display = 'flex';
            } else {
                userInfo.style.display = 'none';
            }
        }

        // 更新提交订单按钮
        this.updateSubmitButton();
    }

    /** 管理员后台面板 */
    showAdminPanel() {
        if (!this.auth.isAdmin()) {
            alert('无管理员权限');
            return;
        }

        const users = this.auth.getAllUsers();
        const orderStats = this.orderManager.getStatistics();

        let userListHTML = users.map(u =>
            `<tr>
                <td>${u.username}</td>
                <td>${u.name}</td>
                <td>${u.role}</td>
                <td>${u.email || '-'}</td>
                <td>${new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
            </tr>`
        ).join('');

        const panelHTML = `
            <div class="admin-panel">
                <h2>🔧 管理员后台</h2>
                <div class="admin-section">
                    <h3>订单统计</h3>
                    <p>总订单: ${orderStats.totalOrders} | 已确认: ${orderStats.confirmedOrders}
                       | 总收入: ¥${orderStats.totalRevenue}</p>
                </div>
                <div class="admin-section">
                    <h3>用户管理 (${users.length}人)</h3>
                    <table class="admin-table">
                        <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>邮箱</th><th>注册时间</th></tr></thead>
                        <tbody>${userListHTML}</tbody>
                    </table>
                </div>
            </div>`;

        const modal = document.getElementById('modal-container');
        if (modal) {
            modal.innerHTML = `
                <div class="modal-content admin-modal">
                    <div class="modal-header">
                        <h2>🔧 管理员后台</h2>
                        <button class="modal-close" id="admin-modal-close">✕</button>
                    </div>
                    <div class="modal-body">${panelHTML}</div>
                </div>`;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.getElementById('admin-modal-close')?.addEventListener('click', () => {
                modal.classList.remove('active');
                modal.setAttribute('aria-hidden', 'true');
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    modal.setAttribute('aria-hidden', 'true');
                }
            });
        }
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
     * AI 观影顾问
     * ================================================================ */

    toggleChatbot(show) {
        const panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        const visible = show !== undefined ? show : (panel.style.display === 'none' || !panel.style.display);
        panel.style.display = visible ? 'flex' : 'none';
        if (visible) {
            this._renderSuggestions();
            document.getElementById('ai-chat-input')?.focus();
        }
    }

    _renderSuggestions() {
        const el = document.getElementById('ai-chat-suggestions');
        if (!el) return;
        const chips = ['推荐座位', '票价多少', '哪个位置好', '怎么看评分', '放映厅信息', '帮助'];
        el.innerHTML = chips.map(c =>
            `<span class="ai-chat-chip" data-q="${c}">${c}</span>`
        ).join('');
        el.querySelectorAll('.ai-chat-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.getElementById('ai-chat-input').value = chip.dataset.q;
                this.sendChatMessage();
            });
        });
    }

    sendChatMessage() {
        const input = document.getElementById('ai-chat-input');
        const msgDiv = document.getElementById('ai-chat-messages');
        if (!input || !msgDiv) return;
        const text = input.value.trim();
        if (!text) return;

        // 更新 chatbot 的 seatData 引用
        this.chatbot.sd = this.seatData;

        // 显示用户消息
        this._appendChatMsg('user', text);
        input.value = '';

        // 模拟思考延迟（200-600ms）
        setTimeout(() => {
            const reply = this.chatbot.chat(text);
            this._appendChatMsg('bot', reply);
            msgDiv.scrollTop = msgDiv.scrollHeight;
        }, 200 + Math.random() * 400);
    }

    _appendChatMsg(role, text) {
        const msgDiv = document.getElementById('ai-chat-messages');
        if (!msgDiv) return;
        const div = document.createElement('div');
        div.className = `ai-chat-msg ${role}`;
        div.textContent = text;
        msgDiv.appendChild(div);
        msgDiv.scrollTop = msgDiv.scrollHeight;
    }

    toggleDarkMode(enabled, persist = true) {
        return this.settingsController.setTheme(enabled ? 'dark' : 'light', persist);
    }

    toggleAccessibilityMode(enabled, persist = true) {
        return this.settingsController.setAccessibilityMode(enabled, persist);
    }

    toggleVoice(enabled, persist = true) {
        return this.settingsController.setVoiceEnabled(enabled, persist);
    }

    toggleColorblindMode(enabled, persist = true) {
        return this.settingsController.setColorblindMode(enabled, persist);
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
            this._showToast(`🔔 ${evt.ownerLabel} 刚刚购买了 ${this._seatLabel(evt.seatKey)}`);
        } else {
            const held = this.controller.applyRemoteHold(evt);
            if (!held.ok || evt.showtimeId !== this.controller.getState().showtimeId) return;
            this._projectRemoteHolds();
            if (evt.type === 'hold') {
                this._showToast(`👆 ${evt.ownerLabel} 正在查看 ${this._seatLabel(evt.seatKey)}`);
            }
        }
        this.cinema.redraw();
        this.updateUI();
    }

    _showToast(msg) {
        return this.toast.show(msg);
    }

    toggleRealtime(enabled, persist = true) {
        return this.settingsController.setRealtimeEnabled(enabled, persist);
    }

    /** 设置主题强调色 */
    setAccentColor(color, persist = true) {
        return this.settingsController.setAccentColor(color, persist);
    }

    loadSettings() {
        return this.settingsController.load();
    }

    applyPersistedSoldSeats() {
        const soldKeys = this.controller.getState().inventory.soldSeatKeys;
        soldKeys.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.seatData.getSeat(row, col);
            if (seat) {
                seat.status = SEAT_STATUS.OCCUPIED;
                seat.isSelected = false;
                this.seatData.selectedSeats.delete(key);
            }
        });
        this._restoreSelectionFromController();
        this._projectRemoteHolds();
    }

    _projectRemoteHolds() {
        for (let row = 0; row < this.seatData.rows; row++) {
            for (let col = 0; col < this.seatData.cols; col++) {
                this.seatData.getSeat(row, col).isRemoteHeld = false;
            }
        }
        this.controller.getState().remoteHoldsBySeatKey.forEach((hold, seatKey) => {
            const [row, col] = seatKey.split('-').map(Number);
            const seat = this.seatData.getSeat(row, col);
            if (seat && seat.status === SEAT_STATUS.AVAILABLE && !seat.isSelected) {
                seat.isRemoteHeld = true;
            }
        });
    }

    restoreSeatSelection() {
        this._restoreSelectionFromController();
    }

    _restoreSelectionFromController() {
        this.seatData.clearSelection();
        this.controller.getState().selection.seatKeys.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            if (this.seatData.isSeatAvailable(row, col)) {
                this.seatData.selectSeat(row, col);
            }
        });
    }

    saveToStorage() {
        const seatKeys = this.seatData.getSelectedSeats().map(seat => `${seat.row}-${seat.col}`);
        return this.controller.replaceSelection(seatKeys);
    }

    handleExport() {
        const includeCredentials = window.confirm(
            '是否导出可移植的完整备份？\n\n' +
            '“确定”会包含本地演示账号的明文密码，请妥善保管。\n' +
            '“取消”仍会导出不含密码的安全备份；该备份只能恢复到保留同一账号的安装。'
        );
        const exported = this.controller.exportBackup({ includeCredentials });
        if (!exported.ok) {
            window.alert(`✗ 导出失败：${exported.error.message}`);
            return;
        }

        const blob = new Blob([exported.value.json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartcinema_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.hidden = true;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const confirmed = window.confirm(
                    '导入会用所选备份替换当前用户、订单、库存和设置。\n' +
                    '系统会先保存一份当前 v2 状态用于恢复。是否继续？'
                );
                if (!confirmed) return;

                const imported = this.controller.importBackup(ev.target.result);
                if (!imported.ok) {
                    window.alert(`✗ 导入失败：${imported.error.message}`);
                    return;
                }
                const cleanupNote = imported.value.cleanupWarning ?
                    `\n注意：${imported.value.cleanupWarning}` : '';
                window.alert(`✓ 数据已安全导入，当前登录状态已清除，即将刷新${cleanupNote}`);
                window.location.reload();
            };
            reader.onerror = () => window.alert('✗ 无法读取所选文件');
            reader.readAsText(file);
        };
        input.click();
    }

    /* ================================================================
     * 工具
     * ================================================================ */

    _setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    _toggleEl(el, show) {
        if (el) el.style.display = show ? '' : 'none';
    }

    _getDayIndex() {
        const value = Number.parseInt(document.getElementById('day-selector')?.value, 10);
        return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 3;
    }

    _getShowtimeId(hallType = this.seatData.hallType, dayIndex = this._getDayIndex()) {
        return `${hallType}:day:${dayIndex}`;
    }

    _getRealtimeContext() {
        const availableSeatKeys = [];
        for (let row = 0; row < this.seatData.rows; row++) {
            for (let col = 0; col < this.seatData.cols; col++) {
                if (this.seatData.isSeatAvailable(row, col)) availableSeatKeys.push(`${row}-${col}`);
            }
        }
        return {
            showtimeId: this._getShowtimeId(),
            availableSeatKeys
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
    // 暴露到全局以便 HTML onclick 调用
    window.app = app;
    console.log('🎬 SmartCinema ready');
});

export default SmartCinema;
