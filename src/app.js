/**
 * SmartCinema - 主应用入口
 * 初始化所有模块，管理应用状态和交互
 *
 * 加载顺序: Auth → SeatData → Cinema → Modules → UI Bindings
 */

import { SeatData, HALL_CONFIG } from './core/SeatData.js';
import { Cinema } from './core/Cinema.js';
import { RecommendEngine } from './modules/RecommendEngine.js';
import { ScoreEngine } from './modules/ScoreEngine.js';

import { OrderManager } from './modules/OrderManager.js';
import { AuthManager } from './modules/AuthManager.js';
import { AIChatbot } from './modules/AIChatbot.js';
import { RealtimeSimulator } from './modules/RealtimeSimulator.js';
import { Storage } from './utils/storage.js';
import { AccessibilityManager } from './utils/accessibility.js';

class SmartCinema {
    constructor() {
        // 存储
        this.storage = new Storage();

        // 认证（最先初始化）
        this.auth = new AuthManager(this.storage);

        // 座位数据（默认中厅）
        this.seatData = new SeatData('medium');

        // 引擎
        this.recommendEngine = new RecommendEngine(this.seatData);
        this.scoreEngine = new ScoreEngine(this.seatData);
        this.orderManager = new OrderManager(this.storage);
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
        this.authModal = document.getElementById('auth-modal');
        this.authForm = document.getElementById('auth-form');
        this.authTitle = document.getElementById('auth-title');
        this.authSubmit = document.getElementById('auth-submit');
        this.authSwitch = document.getElementById('auth-switch');
        this.authError = document.getElementById('auth-error');

        // 渲染引擎
        this.cinema = new Cinema(this.cinemaCanvas, this.seatData);

        // WebSocket 实时模拟器
        this.realtime = new RealtimeSimulator(this.seatData, this.cinema, {
            interval: 6000,
            onEvent: (evt) => this._onRealtimeEvent(evt),
        });

        // 状态
        this.authMode = 'login'; // 'login' | 'register'

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

        // ★ 查看历史订单
        document.getElementById('btn-view-orders')?.addEventListener('click', () => {
            this.toggleOrdersMini();
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

        // 导出/导入
        document.getElementById('export-data')?.addEventListener('click', () => this.handleExport());
        document.getElementById('import-data')?.addEventListener('click', () => this.handleImport());

        // 设置
        document.getElementById('theme-toggle')?.addEventListener('change', (e) => {
            this.toggleDarkMode(e.target.checked);
        });
        document.getElementById('accessibility-toggle')?.addEventListener('change', (e) => {
            this.toggleAccessibilityMode(e.target.checked);
        });
        document.getElementById('voice-toggle')?.addEventListener('change', (e) => {
            this.a11yManager.setVoiceEnabled(e.target.checked);
        });
        document.getElementById('colorblind-toggle')?.addEventListener('change', (e) => {
            this.toggleColorblindMode(e.target.checked);
        });
        document.getElementById('realtime-toggle')?.addEventListener('change', (e) => {
            this.toggleRealtime(e.target.checked);
        });

        // ★ 主题色自定义
        document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.addEventListener('click', () => this.setAccentColor(dot.dataset.accent));
        });
        document.getElementById('accent-picker')?.addEventListener('input', (e) => {
            this.setAccentColor(e.target.value);
        });

        // 认证事件
        this.loginBtn?.addEventListener('click', () => this.showAuthModal('login'));
        this.registerBtn?.addEventListener('click', () => this.showAuthModal('register'));
        this.logoutBtn?.addEventListener('click', () => this.handleLogout());
        this.adminBtn?.addEventListener('click', () => this.showAdminPanel());

        // 认证模态框
        document.getElementById('auth-modal-close')?.addEventListener('click', () => this.hideAuthModal());
        this.authSubmit?.addEventListener('click', () => this.handleAuthSubmit());
        this.authSwitch?.addEventListener('click', () => {
            this.showAuthModal(this.authMode === 'login' ? 'register' : 'login');
        });

        // 点击模态框外部关闭
        this.authModal?.addEventListener('click', (e) => {
            if (e.target === this.authModal) this.hideAuthModal();
        });

        // 窗口缩放
        window.addEventListener('resize', () => {
            this.cinema.resize();
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
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.handleClear();
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

        const dayIndex = parseInt(document.getElementById('day-selector')?.value) || 3;

        // 切换数据层
        this.seatData.switchHall(hallType, dayIndex);
        this.recommendEngine = new RecommendEngine(this.seatData);
        this.scoreEngine = new ScoreEngine(this.seatData);

        // ★ 复用现有渲染实例，不创建新的 —— 避免多实例事件监听器叠加
        this.cinema.sd = this.seatData;
        this.cinema.relayout();
        this.cinema.redraw();

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
        this.cinema.sd = this.seatData;
        this.cinema.relayout();
        this.cinema.redraw();
        this.updateUI();
        this.updateScore();

        const days = ['周一','周二','周三','周四','周五','周六','周日'];
        this.a11yManager.announce(`已切换到${days[dayIndex]}`);
    }

    /* ================================================================
     * 选座 & 推荐
     * ================================================================ */

    onSelectionChange(detail) {
        this.updateStats(detail.stats);
        this.updateScore();
        this.updateSubmitButton();
        this.saveToStorage();
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
        } else if (groupSize >= 3 && groupSize <= 5) {
            options.push({v:'family', t:'👨‍👩‍👧 家庭'});
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
    }

    applyRecommendation() {
        this.seatData.clearSelection();
        const recommended = this.seatData.getRecommendedSeats();
        recommended.forEach(seat => {
            this.seatData.selectSeat(seat.row, seat.col);
        });
        this.cinema.redraw();
        this.updateScore();
    }

    handleClear() {
        this.seatData.clearSelection();
        this.seatData.clearRecommended();
        this.cinema.redraw();
        this.updateUI();
        this.updateScore();
    }

    /* ================================================================
     * 评分
     * ================================================================ */

    updateScore() {
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
        const btn = document.getElementById('btn-submit-order');
        const summary = document.getElementById('order-summary-mini');
        if (!btn || !summary) return;

        const selected = this.seatData.getSelectedSeats();
        const loggedIn = this.auth.isLoggedIn();

        if (selected.length === 0) {
            summary.textContent = '暂未选择座位';
            btn.disabled = true;
            btn.textContent = '📋 提交订单';
        } else {
            const total = selected.reduce((s, seat) => s + seat.price, 0);
            summary.innerHTML = `已选 <b>${selected.length}</b> 座 · 合计 <b style="color:#FDD835;">¥${total}</b>`;
            btn.disabled = !loggedIn;
            btn.textContent = loggedIn ? `📋 提交订单 (¥${total})` : '📋 请先登录';
        }
    }

    /** 提交订单 → 跳转独立确认页 */
    handleSubmitOrder() {
        if (!this.requireAuth()) return;

        const selected = this.seatData.getSelectedSeats();
        if (selected.length === 0) {
            alert('请先选择座位');
            return;
        }

        const user = this.auth.getCurrentUser();
        const totalPrice = selected.reduce((s, seat) => s + seat.price, 0);
        const avgPrice = Math.round(totalPrice / selected.length);

        // 把订单摘要写入 sessionStorage 供 order.html 读取
        const summary = {
            hallType: this.seatData.hallType,
            hallName: this.seatData.getHallConfig().name,
            hallDesc: this.seatData.getHallConfig().desc,
            seats: selected.map(s => ({ row: s.row, col: s.col, price: s.price })),
            totalPrice,
            avgPrice,
            occupiedSeats: this.seatData.getAllOccupiedKeys(),
            userName: user.name,
            userEmail: user.email || '',
            timestamp: Date.now(),
        };
        sessionStorage.setItem('smartcinema_order_summary', JSON.stringify(summary));
        window.location.href = 'order.html';
    }

    /** 迷你订单历史（侧边栏） */
    toggleOrdersMini() {
        const container = document.getElementById('orders-mini-list');
        if (!container) return;

        if (container.style.display === 'none' || !container.style.display) {
            container.style.display = 'block';
            this._renderOrdersMini(container);
        } else {
            container.style.display = 'none';
        }
    }

    _renderOrdersMini(container) {
        const orders = this.orderManager.getOrders({ sort: 'newest' });
        const stats = this.orderManager.getStatistics();

        if (orders.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:12px;">暂无订单</p>';
            return;
        }

        let html = `<div style="font-size:0.8em;color:var(--text-secondary);margin-bottom:8px;">
            共${stats.totalOrders}单 · 已确认${stats.confirmedOrders} · 收入¥${stats.totalRevenue}
        </div>`;

        orders.slice(0, 5).forEach(order => {
            const seats = order.seats.map(s => `${s.row+1}排${s.col+1}座`).join(' ');
            const statusText = this.orderManager.getStatusText(order.status);
            html += `<div class="order-card status-${order.status}" style="font-size:0.78em;padding:8px;">
                <div class="order-header-row"><span class="order-id">${order.id}</span>
                <span class="order-status-badge">${statusText}</span></div>
                <div>${seats} | ¥${order.totalPrice}</div>
            </div>`;
        });

        if (orders.length > 5) {
            html += `<p style="text-align:center;font-size:0.8em;color:var(--text-secondary);">
                还有 ${orders.length - 5} 单...</p>`;
        }

        container.innerHTML = html;
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

    showAuthModal(mode) {
        this.authMode = mode;
        if (this.authTitle) {
            this.authTitle.textContent = mode === 'login' ? '用户登录' : '注册会员';
        }
        if (this.authSubmit) {
            this.authSubmit.textContent = mode === 'login' ? '登 录' : '注 册';
        }
        if (this.authSwitch) {
            this.authSwitch.textContent = mode === 'login' ? '没有账号？立即注册' : '已有账号？立即登录';
        }
        if (this.authError) {
            this.authError.textContent = '';
        }

        // 注册时显示额外字段
        const extraFields = document.getElementById('register-extra-fields');
        if (extraFields) {
            extraFields.style.display = mode === 'register' ? 'block' : 'none';
        }

        if (this.authModal) {
            this.authModal.classList.add('active');
            this.authModal.setAttribute('aria-hidden', 'false');
        }
    }

    hideAuthModal() {
        if (this.authModal) {
            this.authModal.classList.remove('active');
            this.authModal.setAttribute('aria-hidden', 'true');
        }
    }

    handleAuthSubmit() {
        const username = document.getElementById('auth-username')?.value?.trim();
        const password = document.getElementById('auth-password')?.value?.trim();

        if (!username || !password) {
            this.showAuthError('请填写用户名和密码');
            return;
        }

        if (this.authMode === 'register') {
            const name = document.getElementById('auth-name')?.value?.trim();
            const email = document.getElementById('auth-email')?.value?.trim();
            const result = this.auth.register({ username, password, name, email });
            if (result.success) {
                // 注册成功后自动登录
                this.auth.login(username, password);
                this.hideAuthModal();
                this.updateAuthUI();
                alert('注册成功！您已获得会员资格');
                this.a11yManager.announce('注册成功，欢迎' + name);
            } else {
                this.showAuthError(result.message);
            }
        } else {
            const result = this.auth.login(username, password);
            if (result.success) {
                this.hideAuthModal();
                this.updateAuthUI();
                this.a11yManager.announce('登录成功，欢迎' + result.user.name);
            } else {
                this.showAuthError(result.message);
            }
        }
    }

    showAuthError(msg) {
        if (this.authError) {
            this.authError.textContent = msg;
            this.authError.style.display = 'block';
        }
    }

    handleLogout() {
        if (confirm('确定要退出登录吗？')) {
            this.auth.logout();
            this.updateAuthUI();
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

    toggleDarkMode(enabled) {
        document.body.classList.toggle('dark-mode', enabled);
        const settings = this.storage.loadSettings();
        settings.darkMode = enabled;
        this.storage.saveSettings(settings);
    }

    toggleAccessibilityMode(enabled) {
        document.body.classList.toggle('accessibility-mode', enabled);
        const settings = this.storage.loadSettings();
        settings.accessibilityMode = enabled;
        this.storage.saveSettings(settings);
        if (enabled) this.a11yManager.speak('无障碍模式已启用');
    }

    toggleColorblindMode(enabled) {
        document.body.classList.toggle('colorblind-mode', enabled);
        this.cinema.setColorblindMode(enabled);
        const settings = this.storage.loadSettings();
        settings.colorblindMode = enabled;
        this.storage.saveSettings(settings);
    }

    /* ================================================================
     * 实时模拟（模拟WebSocket）
     * ================================================================ */
    _onRealtimeEvent(evt) {
        if (evt.type === 'purchase') {
            this._showToast(`🔔 ${evt.userName} 刚刚购买了 ${evt.posLabel}`);
        } else {
            this._showToast(`👆 ${evt.userName} 正在查看 ${evt.posLabel}`);
        }
        this.updateUI();
    }

    _showToast(msg) {
        let toast = document.getElementById('global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-toast';
            toast.style.cssText = `
                position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2000;
                background:#21262D;color:#C9D1D9;border:1px solid #30363D;
                padding:10px 20px;border-radius:8px;font-size:0.9em;font-weight:600;
                pointer-events:none;opacity:0;transition:opacity 0.3s;
                box-shadow:0 4px 16px rgba(0,0,0,0.4);
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
    }

    toggleRealtime(enabled) {
        if (enabled) {
            this.realtime = new RealtimeSimulator(this.seatData, this.cinema, {
                interval: 6000,
                onEvent: (evt) => this._onRealtimeEvent(evt),
            });
            this.realtime.start();
        } else {
            if (this.realtime) this.realtime.stop();
        }
        const settings = this.storage.loadSettings();
        settings.realtimeEnabled = enabled;
        this.storage.saveSettings(settings);
    }

    /** 设置主题强调色 */
    setAccentColor(color) {
        document.documentElement.style.setProperty('--accent', color);
        // 同步 color picker
        const picker = document.getElementById('accent-picker');
        if (picker) picker.value = color;
        // 更新主题圆点 active 状态
        document.querySelectorAll('.theme-dot').forEach(d => {
            d.classList.toggle('active', d.dataset.accent === color);
        });
        // 持久化
        const settings = this.storage.loadSettings();
        settings.accentColor = color;
        this.storage.saveSettings(settings);
    }

    loadSettings() {
        const settings = this.storage.loadSettings();
        if (settings.darkMode) {
            const cb = document.getElementById('theme-toggle');
            if (cb) cb.checked = true;
            this.toggleDarkMode(true);
        }
        if (settings.accessibilityMode) {
            const cb = document.getElementById('accessibility-toggle');
            if (cb) cb.checked = true;
            this.toggleAccessibilityMode(true);
        }
        if (settings.colorblindMode) {
            const cb = document.getElementById('colorblind-toggle');
            if (cb) cb.checked = true;
            this.toggleColorblindMode(true);
        }
        if (settings.accentColor) {
            this.setAccentColor(settings.accentColor);
        }
    }

    saveToStorage() {
        this.storage.saveSeatSelection(this.seatData);
    }

    handleExport() {
        const data = this.storage.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartcinema_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (this.storage.importData(ev.target.result)) {
                    alert('✓ 数据已导入，即将刷新');
                    location.reload();
                } else {
                    alert('✗ 导入失败');
                }
            };
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
