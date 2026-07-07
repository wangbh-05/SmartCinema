/**
 * HeatmapEngine — 影院热度地图 (Canvas)
 * 配色：蓝=冷门 → 黄=一般 → 红=热门（严格按作业要求）
 */
import { SEAT_STATUS } from '../core/SeatData.js';

export class HeatmapEngine {
    constructor(canvas, seatData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.seatData = seatData;
        this._initLayout();
        this.draw();
    }

    _initLayout() {
        const { rows, cols } = this.seatData;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const maxW = Math.min(window.innerWidth - 40, 1100);
        const cell = Math.max(14, Math.min(24, Math.floor((maxW - 80) / cols)));
        const pad = 44;
        this.C = { cell, pad };
        const w = pad * 2 + cols * cell;
        const h = pad * 2 + rows * cell + 30;
        this.canvas.width  = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.displayW = w; this.displayH = h;
    }

    draw() {
        const { rows, cols } = this.seatData;
        const { cell, pad } = this.C;
        const ctx = this.ctx;
        const W = this.displayW, H = this.displayH;

        // 背景
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
        const data = this._calcHeat();

        // 热力单元格
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = pad + c * cell, y = pad + r * cell;
                ctx.fillStyle = this._heatColor(data[r][c]);
                ctx.fillRect(x, y, cell, cell);
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 0.5; ctx.strokeRect(x, y, cell, cell);
            }
        }

        // 行列标签
        ctx.fillStyle = '#6B7280'; ctx.font = 'bold 10px "Microsoft YaHei",sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let r = 0; r < rows; r++) {
            ctx.fillText(`${r+1}排`, pad - 8, pad + r*cell + cell/2);
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const step = Math.max(1, Math.floor(cols / 20));
        for (let c = 0; c < cols; c += step) {
            ctx.fillText(`${c+1}`, pad + c*cell + cell/2, pad - 8);
        }

        // 标题
        ctx.fillStyle = '#9CA3AF'; ctx.font = '12px "Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('影院热度分布  🔴热门  🟡一般  🔵冷门', W/2, H - 8);
    }

    _calcHeat() {
        const { rows, cols } = this.seatData;
        const grid = Array.from({length: rows}, () => new Array(cols).fill(0));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const seat = this.seatData.getSeat(r, c);
                if (seat.status === SEAT_STATUS.OCCUPIED) grid[r][c] = 0.85;
                else if (seat.isSelected) grid[r][c] = 0.7;
                else grid[r][c] = this._localHeat(r, c);
            }
        }
        return grid;
    }

    _localHeat(r, c) {
        let occ = 0, total = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nb = this.seatData.getSeat(r + dr, c + dc);
                if (nb) { total++; if (nb.status === SEAT_STATUS.OCCUPIED || nb.isSelected) occ++; }
            }
        }
        return total ? Math.min(0.55, (occ / total) * 0.7) : 0.08;
    }

    /** 蓝(冷)→黄(一般)→红(热门) */
    _heatColor(v) {
        if (v < 0.33) {
            const t = v / 0.33;
            return `rgb(${Math.round(30+40*t)},${Math.round(100+100*t)},${Math.round(200-60*t)})`;
        } else if (v < 0.67) {
            const t = (v - 0.33) / 0.34;
            return `rgb(${Math.round(70+185*t)},${Math.round(200+(235-200)*t)},${Math.round(140-140*t)})`;
        } else {
            const t = (v - 0.67) / 0.33;
            return `rgb(255,${Math.round(235-200*t)},${Math.round(40*t)})`;
        }
    }

    reload() { this._initLayout(); this.draw(); }
    resize() { this._initLayout(); this.draw(); }
}
