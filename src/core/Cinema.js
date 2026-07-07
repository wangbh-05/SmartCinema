/**
 * Cinema - Canvas 影院绘图引擎
 * 负责在 Canvas 上绘制电影院座位布局
 * 实现了完整的坐标映射、事件处理、选中高亮等功能
 */

export class Cinema {
    constructor(canvas, seatData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.seatData = seatData;
        this.dragStart = null;
        this.isMultiSelect = false;

        // 绘图配置
        this.config = {
            seatSize: 20,
            seatGap: 8,
            screenMargin: 60,
            sideMargin: 50,
            rowLabelWidth: 30,
            colLabelHeight: 30,
            animationDuration: 200
        };

        // 计算布局尺寸
        this.calculateLayout();
        
        // 绑定事件
        this.bindEvents();
        
        // 初始绘制
        this.redraw();
    }

    /**
     * 计算 Canvas 布局尺寸
     */
    calculateLayout() {
        const { seatSize, seatGap, screenMargin, sideMargin, rowLabelWidth, colLabelHeight } = this.config;
        const { rows, cols } = this.seatData;

        // 计算总宽高
        this.totalWidth = sideMargin + rowLabelWidth + cols * (seatSize + seatGap) + sideMargin;
        this.totalHeight = sideMargin + colLabelHeight + rows * (seatSize + seatGap) + screenMargin + sideMargin;

        // 计算起始坐标
        this.offsetX = sideMargin + rowLabelWidth;
        this.offsetY = sideMargin + colLabelHeight;

        // 调整 Canvas 尺寸
        this.canvas.width = Math.min(this.totalWidth, window.innerWidth - 40);
        this.canvas.height = Math.min(this.totalHeight, window.innerHeight - 300);
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        
        // 触屏支持
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', () => this.handleTouchEnd());
    }

    /**
     * 获取鼠标在 Canvas 中的相对坐标
     */
    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * 将 Canvas 坐标映射到座位坐标
     */
    canvasCoordsToSeatCoords(x, y) {
        const { seatSize, seatGap } = this.config;
        const { rows, cols } = this.seatData;

        // 检查是否在有效范围内
        const minX = this.offsetX;
        const minY = this.offsetY;
        const maxX = this.offsetX + cols * (seatSize + seatGap);
        const maxY = this.offsetY + rows * (seatSize + seatGap);

        if (x < minX || x > maxX || y < minY || y > maxY) {
            return null;
        }

        // 计算座位索引
        const col = Math.floor((x - minX) / (seatSize + seatGap));
        const row = Math.floor((y - minY) / (seatSize + seatGap));

        return (row >= 0 && row < rows && col >= 0 && col < cols) ? { row, col } : null;
    }

    /**
     * 点击事件处理
     */
    handleClick(e) {
        const coords = this.getCanvasCoords(e);
        const seatCoords = this.canvasCoordsToSeatCoords(coords.x, coords.y);

        if (!seatCoords) return;

        // 检查多选模式
        this.isMultiSelect = e.ctrlKey || e.metaKey;

        if (!this.isMultiSelect) {
            this.seatData.clearSelection();
        }

        // 切换座位选择
        const { row, col } = seatCoords;
        if (this.seatData.isSeatAvailable(row, col)) {
            if (this.seatData.getSeat(row, col).isSelected) {
                this.seatData.deselectSeat(row, col);
            } else {
                this.seatData.selectSeat(row, col);
            }
        }

        this.redraw();
        this.dispatchSelectionChange();
    }

    /**
     * 鼠标按下 - 拖拽开始
     */
    handleMouseDown(e) {
        const coords = this.getCanvasCoords(e);
        const seatCoords = this.canvasCoordsToSeatCoords(coords.x, coords.y);
        
        if (seatCoords) {
            this.dragStart = seatCoords;
        }
    }

    /**
     * 鼠标移动 - 拖拽预览
     */
    handleMouseMove(e) {
        if (!this.dragStart) {
            this.canvas.style.cursor = 'default';
            return;
        }

        const coords = this.getCanvasCoords(e);
        const seatCoords = this.canvasCoordsToSeatCoords(coords.x, coords.y);

        if (seatCoords) {
            this.canvas.style.cursor = 'pointer';
        }
    }

    /**
     * 鼠标释放 - 拖拽选择
     */
    handleMouseUp() {
        if (!this.dragStart) return;
        this.dragStart = null;
    }

    /**
     * 鼠标离开 Canvas
     */
    handleMouseLeave() {
        this.dragStart = null;
    }

    /**
     * 触屏开始
     */
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const fakeEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseDown(fakeEvent);
        }
    }

    /**
     * 触屏移动
     */
    handleTouchMove(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const fakeEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseMove(fakeEvent);
        }
    }

    /**
     * 触屏结束
     */
    handleTouchEnd() {
        this.handleMouseUp();
    }

    /**
     * 绘制整个画布
     */
    redraw() {
        // 清空 Canvas
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制屏幕
        this.drawScreen();
        
        // 绘制行标签
        this.drawRowLabels();
        
        // 绘制列标签
        this.drawColLabels();
        
        // 绘制座位
        this.drawSeats();
        
        // 绘制图例
        this.drawLegend();
    }

    /**
     * 绘制屏幕
     */
    drawScreen() {
        const { rows, cols } = this.seatData;
        const { seatSize, seatGap, screenMargin, sideMargin } = this.config;

        const screenY = this.offsetY - screenMargin / 2;
        const screenX = this.offsetX - 10;
        const screenWidth = cols * (seatSize + seatGap) + 20;

        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(screenX, screenY, screenWidth, screenMargin / 2);

        this.ctx.fillStyle = '#FFF';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🎬 SCREEN 🎬', screenX + screenWidth / 2, screenY + screenMargin / 4 + 5);
    }

    /**
     * 绘制行标签
     */
    drawRowLabels() {
        const { rows } = this.seatData;
        const { seatSize, seatGap } = this.config;

        this.ctx.fillStyle = '#666';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        for (let row = 0; row < rows; row++) {
            const y = this.offsetY + row * (seatSize + seatGap) + seatSize / 2;
            const x = this.offsetX - 20;
            this.ctx.fillText(String.fromCharCode(65 + row), x, y);
        }
    }

    /**
     * 绘制列标签
     */
    drawColLabels() {
        const { cols } = this.seatData;
        const { seatSize, seatGap } = this.config;

        this.ctx.fillStyle = '#666';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        for (let col = 0; col < cols; col++) {
            const x = this.offsetX + col * (seatSize + seatGap) + seatSize / 2;
            const y = this.offsetY - 10;
            this.ctx.fillText((col + 1).toString(), x, y);
        }
    }

    /**
     * 绘制座位
     */
    drawSeats() {
        const { rows, cols } = this.seatData;
        const { seatSize, seatGap } = this.config;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const seat = this.seatData.getSeat(row, col);
                const x = this.offsetX + col * (seatSize + seatGap);
                const y = this.offsetY + row * (seatSize + seatGap);

                this.drawSeat(x, y, seat, seatSize);
            }
        }
    }

    /**
     * 绘制单个座位
     */
    drawSeat(x, y, seat, size) {
        let fillColor = '#E0F2F1';
        let strokeColor = '#00796B';
        let lineWidth = 1;

        if (seat.status === 'occupied') {
            fillColor = '#BDBDBD';
            strokeColor = '#757575';
        } else if (seat.status === 'vip') {
            fillColor = '#FFD54F';
            strokeColor = '#FBC02D';
        } else if (seat.isSelected) {
            fillColor = '#FF6B35';
            strokeColor = '#E55A2B';
            lineWidth = 2;
        } else if (seat.isRecommended) {
            fillColor = '#FFBB00';
            strokeColor = '#FF9800';
            lineWidth = 2;
        }

        // 绘制座位矩形
        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = lineWidth;
        this.ctx.fillRect(x, y, size, size);
        this.ctx.strokeRect(x, y, size, size);

        // 添加座位号（可选）
        if (seat.isSelected || seat.isRecommended) {
            this.ctx.fillStyle = '#000';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('✓', x + size / 2, y + size / 2);
        }
    }

    /**
     * 绘制图例
     */
    drawLegend() {
        const legendX = 10;
        const legendY = this.canvas.height - 80;
        const itemHeight = 20;
        const itemWidth = 100;

        const legend = [
            { color: '#E0F2F1', label: '可用' },
            { color: '#FF6B35', label: '已选' },
            { color: '#FFBB00', label: '推荐' },
            { color: '#BDBDBD', label: '已售' },
            { color: '#FFD54F', label: 'VIP' }
        ];

        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';

        legend.forEach((item, index) => {
            const x = legendX + (index % 3) * (itemWidth + 20);
            const y = legendY + Math.floor(index / 3) * itemHeight;

            // 颜色块
            this.ctx.fillStyle = item.color;
            this.ctx.fillRect(x, y - 6, 12, 12);
            this.ctx.strokeStyle = '#999';
            this.ctx.strokeRect(x, y - 6, 12, 12);

            // 标签
            this.ctx.fillStyle = '#333';
            this.ctx.fillText(item.label, x + 18, y);
        });
    }

    /**
     * 触发选择变更事件
     */
    dispatchSelectionChange() {
        const event = new CustomEvent('selectionChange', {
            detail: {
                selectedSeats: this.seatData.getSelectedSeats(),
                stats: this.seatData.getStats()
            }
        });
        this.canvas.dispatchEvent(event);
    }

    /**
     * 调整 Canvas 尺寸
     */
    resize() {
        this.calculateLayout();
        this.redraw();
    }
}
