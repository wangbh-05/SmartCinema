/**
 * HeatmapEngine - 影院热度地图绘制引擎
 * 使用 Canvas 绘制热力地图，展示影院座位受欢迎程度
 */

export class HeatmapEngine {
    constructor(canvas, seatData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.seatData = seatData;
        this.config = {
            cellSize: 20,
            padding: 40
        };
    }

    /**
     * 绘制热度地图
     */
    draw() {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const { cellSize, padding } = this.config;
        const { rows, cols } = this.seatData;

        // 计算热度数据
        const heatData = this.calculateHeatData();

        // 绘制热力图
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const heat = heatData[row][col];
                const x = padding + col * cellSize;
                const y = padding + row * cellSize;

                this.drawCell(x, y, cellSize, heat);
            }
        }

        // 绘制轴标签和标题
        this.drawLabels();
    }

    /**
     * 计算每个座位的热度指数
     * 热度基于：已占用座位数、已选座位数、位置中心度
     */
    calculateHeatData() {
        const { rows, cols } = this.seatData;
        const heatData = Array(rows)
            .fill(null)
            .map(() => Array(cols).fill(0));

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const seat = this.seatData.getSeat(row, col);
                let heat = 0;

                if (seat.status === 'occupied') {
                    heat = 0.8; // 已占用座位：热度高
                } else if (seat.isSelected) {
                    heat = 0.7; // 已选座位：热度中等偏高
                } else if (seat.status === 'available') {
                    // 可用座位：根据周围情况计算热度
                    heat = this.calculateLocalHeat(row, col);
                }

                heatData[row][col] = heat;
            }
        }

        return heatData;
    }

    /**
     * 计算局部热度
     */
    calculateLocalHeat(row, col) {
        let occupiedCount = 0;
        let totalNeighbors = 0;

        // 检查周围 3x3 区域
        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (r === row && c === col) continue;

                const neighbor = this.seatData.getSeat(r, c);
                if (neighbor) {
                    totalNeighbors++;
                    if (neighbor.status === 'occupied' || neighbor.isSelected) {
                        occupiedCount++;
                    }
                }
            }
        }

        if (totalNeighbors === 0) return 0.1;
        return Math.min(0.6, (occupiedCount / totalNeighbors) * 0.8);
    }

    /**
     * 绘制单个热度单元
     */
    drawCell(x, y, size, heat) {
        // 根据热度选择颜色
        const color = this.heatToColor(heat);

        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, size, size);

        // 绘制边框
        this.ctx.strokeStyle = '#DDD';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(x, y, size, size);
    }

    /**
     * 将热度值（0-1）转换为颜色
     */
    heatToColor(heat) {
        // 冷色（绿）-> 温色（黄）-> 热色（红）
        if (heat < 0.33) {
            // 绿色 -> 黄色
            const ratio = heat / 0.33;
            const r = Math.round(0 + 255 * ratio);
            const g = 170;
            const b = 0;
            return `rgb(${r}, ${g}, ${b})`;
        } else if (heat < 0.67) {
            // 黄色 -> 红色
            const ratio = (heat - 0.33) / 0.34;
            const r = 255;
            const g = Math.round(170 - 170 * ratio);
            const b = 0;
            return `rgb(${r}, ${g}, ${b})`;
        } else {
            // 深红
            const ratio = (heat - 0.67) / 0.33;
            const r = 255;
            const g = 0;
            const b = 0;
            return `rgb(${r}, ${g}, ${b})`;
        }
    }

    /**
     * 绘制标签
     */
    drawLabels() {
        const { cellSize, padding } = this.config;
        const { rows, cols } = this.seatData;

        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 行标签
        for (let row = 0; row < rows; row++) {
            const y = padding + row * cellSize + cellSize / 2;
            const x = padding - 15;
            this.ctx.fillText(String.fromCharCode(65 + row), x, y);
        }

        // 列标签
        for (let col = 0; col < cols; col++) {
            const x = padding + col * cellSize + cellSize / 2;
            const y = padding - 15;
            this.ctx.fillText((col + 1).toString(), x, y);
        }

        // 标题
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('影院座位热度分布', this.canvas.width / 2, 20);
    }

    /**
     * 调整 Canvas 尺寸
     */
    resize() {
        const { cellSize, padding } = this.config;
        const { rows, cols } = this.seatData;
        this.canvas.width = Math.min(padding * 2 + cols * cellSize, window.innerWidth - 40);
        this.canvas.height = Math.min(padding * 2 + rows * cellSize + 40, window.innerHeight - 300);
        this.draw();
    }
}
