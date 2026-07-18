import { SEAT_STATUS } from '../../core/SeatData.js';

const DEFAULT_HEAT_STOPS = {
    cold: [73, 116, 209],
    warm: [231, 184, 76],
    hot: [217, 93, 93]
};

const COLORBLIND_HEAT_STOPS = {
    cold: [37, 99, 235],
    warm: [148, 163, 184],
    hot: [234, 88, 12]
};

export class HeatmapRenderer {
    constructor(canvas, seatData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.seatData = seatData;
        this.heatStops = DEFAULT_HEAT_STOPS;
        this._initLayout();
        this.draw();
    }

    _initLayout() {
        const { rows, cols } = this.seatData;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const availableWidth = this.canvas.parentElement?.clientWidth || window.innerWidth - 40;
        const maxWidth = Math.min(availableWidth, 1100);
        const pad = maxWidth < 420 ? 28 : 44;
        const cell = Math.max(10, Math.min(26, Math.floor((maxWidth - pad * 2) / cols)));
        const width = pad * 2 + cols * cell;
        const height = pad * 2 + rows * cell + 28;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.layout = { cell, pad, width, height };
    }

    draw() {
        const { rows, cols } = this.seatData;
        const { cell, pad, width, height } = this.layout;
        const ctx = this.ctx;
        const heat = this._calculateHeat();

        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, width, height);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = pad + col * cell;
                const y = pad + row * cell;
                ctx.fillStyle = this._heatColor(heat[row][col]);
                ctx.fillRect(x, y, cell, cell);
                ctx.strokeStyle = 'rgba(255,255,255,0.22)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, cell, cell);
            }
        }
        this._drawLabels();
        this._drawLegend();
    }

    _drawLabels() {
        const { rows, cols } = this.seatData;
        const { cell, pad } = this.layout;
        const ctx = this.ctx;
        ctx.fillStyle = '#64748B';
        ctx.font = '600 10px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let row = 0; row < rows; row++) {
            ctx.fillText(`${row + 1}排`, pad - 7, pad + row * cell + cell / 2);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const step = Math.max(1, Math.ceil(cols / 20));
        for (let col = 0; col < cols; col += step) {
            ctx.fillText(`${col + 1}`, pad + col * cell + cell / 2, pad - 7);
        }
    }

    _drawLegend() {
        const { width, height } = this.layout;
        const ctx = this.ctx;
        const items = [
            ['热门', this.heatStops.hot],
            ['一般', this.heatStops.warm],
            ['冷门', this.heatStops.cold]
        ];
        const itemWidth = 54;
        const startX = width / 2 - items.length * itemWidth / 2;
        ctx.font = '10px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        items.forEach(([label, color], index) => {
            const x = startX + index * itemWidth;
            ctx.beginPath();
            ctx.arc(x, height - 12, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${color.join(',')})`;
            ctx.fill();
            ctx.fillStyle = '#64748B';
            ctx.fillText(label, x + 7, height - 12);
        });
    }

    _calculateHeat() {
        const { rows, cols } = this.seatData;
        const heat = Array.from({ length: rows }, () => new Array(cols).fill(0));
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const seat = this.seatData.getSeat(row, col);
                if (seat.status === SEAT_STATUS.OCCUPIED) heat[row][col] = 0.85;
                else if (seat.isSelected) heat[row][col] = 0.7;
                else heat[row][col] = this._localHeat(row, col);
            }
        }
        return heat;
    }

    _localHeat(row, col) {
        let occupied = 0;
        let total = 0;
        for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
            for (let colOffset = -1; colOffset <= 1; colOffset++) {
                if (rowOffset === 0 && colOffset === 0) continue;
                const neighbour = this.seatData.getSeat(row + rowOffset, col + colOffset);
                if (!neighbour) continue;
                total++;
                if (neighbour.status === SEAT_STATUS.OCCUPIED || neighbour.isSelected) occupied++;
            }
        }
        return total ? Math.min(0.55, occupied / total * 0.7) : 0.08;
    }

    _heatColor(value) {
        if (value < 0.5) return this._interpolate(this.heatStops.cold, this.heatStops.warm, value * 2);
        return this._interpolate(this.heatStops.warm, this.heatStops.hot, (value - 0.5) * 2);
    }

    _interpolate(from, to, amount) {
        const color = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
        return `rgb(${color.join(',')})`;
    }

    reload() {
        this._initLayout();
        this.draw();
    }

    resize() {
        this.reload();
    }

    setColorblindMode(enabled) {
        this.heatStops = enabled ? COLORBLIND_HEAT_STOPS : DEFAULT_HEAT_STOPS;
        this.draw();
    }
}

export default HeatmapRenderer;
