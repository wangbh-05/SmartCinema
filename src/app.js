/**
 * SmartCinema - 主应用入口
 * 初始化所有模块，管理应用状态和交互
 */

import { SeatData } from './core/SeatData.js';
import { Cinema } from './core/Cinema.js';
import { RecommendEngine } from './modules/RecommendEngine.js';
import { ScoreEngine } from './modules/ScoreEngine.js';
import { HeatmapEngine } from './modules/HeatmapEngine.js';
import { OrderManager } from './modules/OrderManager.js';
import { Storage } from './utils/storage.js';
import { AccessibilityManager } from './utils/accessibility.js';

class SmartCinema {
    constructor() {
        // 初始化数据和引擎
        this.seatData = new SeatData(10, 20);
        this.storage = new Storage();
        this.recommendEngine = new RecommendEngine(this.seatData);
        this.scoreEngine = new ScoreEngine(this.seatData);
        this.orderManager = new OrderManager(this.storage);
        this.a11yManager = new AccessibilityManager();

        // 获取 DOM 元素
        this.cinemaCanvas = document.getElementById('cinema-canvas');
        this.heatmapCanvas = document.getElementById('heatmap-canvas');
        this.recommendForm = document.getElementById('recommend-form');
        this.clearButton = document.getElementById('clear-selection');
        this.exportButton = document.getElementById('export-data');
        this.importButton = document.getElementById('import-data');

        // 初始化渲染引擎
        this.cinema = new Cinema(this.cinemaCanvas, this.seatData);
        this.heatmap = new HeatmapEngine(this.heatmapCanvas, this.seatData);

        // 绑定事件
        this.bindEvents();

        // 初始化
        this.updateUI();
        this.loadFromStorage();
        
        console.log('SmartCinema App initialized with accessibility support');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // Canvas 选择变更事件
        this.cinemaCanvas.addEventListener('selectionChange', (e) => {
            this.onSelectionChange(e.detail);
        });

        // 推荐表单提交
        this.recommendForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRecommend();
        });

        // 清空选择
        this.clearButton.addEventListener('click', () => {
            this.handleClear();
        });

        // 导出数据
        this.exportButton.addEventListener('click', () => {
            this.handleExport();
        });

        // 导入数据
        this.importButton.addEventListener('click', () => {
            this.handleImport();
        });

        // 设置变更
        document.getElementById('theme-toggle')?.addEventListener('change', (e) => {
            this.toggleDarkMode(e.target.checked);
        });

        document.getElementById('accessibility-toggle')?.addEventListener('change', (e) => {
            this.toggleAccessibilityMode(e.target.checked);
        });

        // 窗口调整
        window.addEventListener('resize', () => {
            this.cinema.resize();
            this.heatmap.resize();
        });
    }

    /**
     * 选座变更处理
     */
    onSelectionChange(detail) {
        // 更新统计信息
        this.updateStats(detail.stats);
        
        // 更新评分
        this.updateScore();
        
        // 更新热度地图
        this.heatmap.draw();
        
        // 保存到存储
        this.storage.saveSeatSelection(this.seatData);
    }

    /**
     * 处理智能推荐
     */
    handleRecommend() {
        const ageGroup = document.getElementById('age-group').value;
        const groupSize = parseInt(document.getElementById('group-size').value);
        const movieType = document.getElementById('movie-type').value;

        if (!ageGroup || !movieType) {
            alert('请填写完整的推荐参数');
            return;
        }

        // 执行推荐
        const result = this.recommendEngine.recommend(ageGroup, groupSize, movieType);

        if (!result.success) {
            alert(result.message);
            return;
        }

        // 清空旧推荐
        this.seatData.clearRecommended();

        // 高亮推荐座位
        this.seatData.setRecommended(result.seats);

        // 显示推荐结果
        const resultDiv = document.getElementById('recommend-result');
        resultDiv.innerHTML = `
            <h4>🎯 推荐结果</h4>
            <p>${result.reason.replace(/\n/g, '<br>')}</p>
            <button class="btn btn-primary" onclick="app.applyRecommendation()">
                ✓ 应用推荐
            </button>
        `;

        // 重绘
        this.cinema.redraw();
        this.heatmap.draw();
    }

    /**
     * 应用推荐座位
     */
    applyRecommendation() {
        this.seatData.clearSelection();
        const recommended = this.seatData.getRecommendedSeats();
        recommended.forEach(seat => {
            this.seatData.selectSeat(seat.row, seat.col);
        });
        this.cinema.redraw();
        this.updateScore();
        this.heatmap.draw();
    }

    /**
     * 更新观影体验评分
     */
    updateScore() {
        const result = this.scoreEngine.calculateScore();
        const scoreDiv = document.getElementById('score-details');

        if (result.totalScore === 0) {
            scoreDiv.innerHTML = '<p>请先选择座位，系统将为您计算观影体验评分</p>';
            return;
        }

        let html = `
            <div class="score-container">
                <div class="score-total">
                    <span class="score-number">${result.totalScore}</span>
                    <span class="score-label">/ 100</span>
                </div>
                <div class="score-breakdown">
        `;

        result.details.forEach(detail => {
            html += `
                <div class="score-item">
                    <span class="emoji">${detail.emoji}</span>
                    <div class="score-content">
                        <h5>${detail.category}</h5>
                        <p>${detail.description}</p>
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${(detail.score / detail.maxScore) * 100}%"></div>
                        </div>
                        <span class="score-text">${detail.score} / ${detail.maxScore}</span>
                    </div>
                </div>
            `;
        });

        html += '</div><div class="score-recommendations">';

        result.recommendations.forEach(rec => {
            html += `<p class="recommendation">${rec.message}</p>`;
        });

        html += '</div></div>';

        scoreDiv.innerHTML = html;
    }

    /**
     * 更新统计信息
     */
    updateStats(stats) {
        document.getElementById('selected-count').textContent = stats.selected;
        document.getElementById('available-count').textContent = stats.available;
        document.getElementById('sold-count').textContent = stats.occupied;
    }

    /**
     * 更新 UI
     */
    updateUI() {
        const stats = this.seatData.getStats();
        this.updateStats(stats);
    }

    /**
     * 清空选择
     */
    handleClear() {
        if (confirm('确定要清空所有选择吗？')) {
            this.seatData.clearSelection();
            this.seatData.clearRecommended();
            this.cinema.redraw();
            this.updateUI();
            this.updateScore();
            this.heatmap.draw();
        }
    }

    /**
     * 切换深色模式
     */
    toggleDarkMode(enabled) {
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        const settings = this.storage.loadSettings();
        settings.darkMode = enabled;
        this.storage.saveSettings(settings);
    }

    /**
     * 切换无障碍模式
     */
    toggleAccessibilityMode(enabled) {
        if (enabled) {
            document.body.classList.add('accessibility-mode');
            this.a11yManager.speak('无障碍模式已启用');
        } else {
            document.body.classList.remove('accessibility-mode');
        }
        const settings = this.storage.loadSettings();
        settings.accessibilityMode = enabled;
        this.storage.saveSettings(settings);
    }

    /**
     * 创建订单
     */
    createOrder(userInfo = {}) {
        const selected = this.seatData.getSelectedSeats();
        
        if (selected.length === 0) {
            this.a11yManager.announce('请先选择座位');
            alert('请先选择座位');
            return;
        }

        const result = this.orderManager.createOrder(selected, userInfo);
        
        if (result.success) {
            const receipt = this.orderManager.generateReceipt(result.order.id);
            console.log('订单已创建:', result.order);
            this.a11yManager.announce(`订单已创建，订单号：${result.order.id}`);
            this.updateOrdersList();
            
            // 显示收据
            alert('订单已创建\n\n' + receipt);
            
            // 清空选择
            this.handleClear();
        } else {
            this.a11yManager.announce(result.message);
            alert('订单创建失败: ' + result.message);
        }
    }

    /**
     * 更新订单列表显示
     */
    updateOrdersList() {
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) return;

        const orders = this.orderManager.getOrders({ sort: 'newest' });
        const stats = this.orderManager.getStatistics();

        if (orders.length === 0) {
            ordersList.innerHTML = '<p>暂无订单</p>';
            return;
        }

        let html = `
            <div class="orders-stats">
                <div class="stat-box">
                    <span class="label">总订单数:</span>
                    <span class="value">${stats.totalOrders}</span>
                </div>
                <div class="stat-box">
                    <span class="label">已确认:</span>
                    <span class="value">${stats.confirmedOrders}</span>
                </div>
                <div class="stat-box">
                    <span class="label">待确认:</span>
                    <span class="value">${stats.pendingOrders}</span>
                </div>
                <div class="stat-box">
                    <span class="label">总收入:</span>
                    <span class="value">¥${stats.totalRevenue}</span>
                </div>
            </div>
            <div class="orders-list-container">
        `;

        orders.forEach(order => {
            const seats = order.seats.map(s => 
                `${String.fromCharCode(65 + s.row)}${s.col + 1}`
            ).join(', ');

            const statusClass = `status-${order.status}`;
            const statusText = this.orderManager.getStatusText(order.status);

            html += `
                <div class="order-card ${statusClass}">
                    <div class="order-header">
                        <h4>${order.id}</h4>
                        <span class="order-status">${statusText}</span>
                    </div>
                    <div class="order-body">
                        <p><strong>用户:</strong> ${order.userInfo.name}</p>
                        <p><strong>座位:</strong> ${seats}</p>
                        <p><strong>数量:</strong> ${order.seatCount} 张</p>
                        <p><strong>总价:</strong> <span class="price">¥${order.totalPrice}</span></p>
                        <p><strong>时间:</strong> ${new Date(order.timestamp).toLocaleString('zh-CN')}</p>
                    </div>
                    <div class="order-actions">
                        ${order.status === 'pending' ? `
                            <button class="btn btn-primary btn-sm" onclick="app.confirmOrder('${order.id}')">
                                确认
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="app.showOrderReceipt('${order.id}')">
                            收据
                        </button>
                        ${order.status !== 'cancelled' ? `
                            <button class="btn btn-danger btn-sm" onclick="app.cancelOrder('${order.id}')">
                                取消
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        ordersList.innerHTML = html;
    }

    /**
     * 确认订单
     */
    confirmOrder(orderId) {
        const result = this.orderManager.confirmOrder(orderId);
        if (result.success) {
            this.a11yManager.announce('订单已确认');
            this.updateOrdersList();
        } else {
            alert('确认失败: ' + result.message);
        }
    }

    /**
     * 取消订单
     */
    cancelOrder(orderId) {
        if (confirm('确定要取消此订单吗？')) {
            const result = this.orderManager.cancelOrder(orderId, '用户主动取消');
            if (result.success) {
                this.a11yManager.announce('订单已取消');
                this.updateOrdersList();
            }
        }
    }

    /**
     * 显示订单收据
     */
    showOrderReceipt(orderId) {
        const receipt = this.orderManager.generateReceipt(orderId);
        if (receipt) {
            alert(receipt);
        }
    }

    /**
     * 导出数据
     */
    handleExport() {
        const data = this.storage.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartcinema_export_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('✓ 数据已导出');
    }

    /**
     * 导入数据
     */
    handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                if (this.storage.importData(event.target.result)) {
                    alert('✓ 数据已导入');
                    location.reload();
                } else {
                    alert('✗ 导入失败，请检查文件格式');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * 从存储加载数据
     */
    loadFromStorage() {
        const settings = this.storage.loadSettings();
        if (settings.darkMode) {
            document.getElementById('theme-toggle').checked = true;
            this.toggleDarkMode(true);
        }
        if (settings.accessibilityMode) {
            document.getElementById('accessibility-toggle').checked = true;
            this.toggleAccessibilityMode(true);
        }
    }
}

// 全局应用实例
let app;

// DOM 加载完成时初始化应用
document.addEventListener('DOMContentLoaded', () => {
    app = new SmartCinema();
    console.log('SmartCinema 应用已初始化');
});

// 导出应用实例供外部访问
export default SmartCinema;
