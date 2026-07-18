import { HALL_CONFIG, SEAT_STATUS } from '../../core/SeatData.js';

const DEFAULT_COLORS = {
    bgGrid: 'rgba(0,0,0,0.04)',
    screen: '#3B82F6',
    avail: '#F9FAFB',
    select: '#F59E0B',
    selectStroke: '#D97706',
    sold: '#9CA3AF',
    soldStroke: '#6B7280',
    remote: '#FDE68A',
    remoteStroke: '#D97706',
    recommended: '#8B5CF6',
    recommendedStroke: '#7C3AED',
    rowLabel: '#6B7280',
    legend: '#4B5563',
    hallInfo: '#6B7280',
    dragLine: '#FBBF24',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: '#D1D5DB',
    tooltipText: '#1F2937'
};

const COLORBLIND_COLORS = {
    ...DEFAULT_COLORS,
    screen: '#2563EB',
    avail: '#F0F4FF',
    select: '#F97316',
    selectStroke: '#EA580C',
    sold: '#78716C',
    soldStroke: '#57534E',
    remote: '#FED7AA',
    remoteStroke: '#C2410C',
    recommended: '#1D4ED8',
    recommendedStroke: '#1E3A8A'
};

const DEFAULT_HEAT_COLORS = {
    hot: { r: 245, g: 120, b: 120 },
    warm: { r: 240, g: 195, b: 80 },
    cold: { r: 100, g: 145, b: 240 }
};

const COLORBLIND_HEAT_COLORS = {
    hot: { r: 234, g: 88, b: 12 },
    warm: { r: 250, g: 165, b: 60 },
    cold: { r: 59, g: 130, b: 246 }
};

export class CinemaRenderer {
    constructor({
        canvas,
        getSeatData,
        getLayout,
        getInteractionState,
        now = () => globalThis.performance?.now?.() ?? Date.now(),
        requestFrame = callback => globalThis.requestAnimationFrame(callback)
    }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.getSeatData = getSeatData;
        this.getLayout = getLayout;
        this.getInteractionState = getInteractionState;
        this.now = now;
        this.requestFrame = requestFrame;
        this.colors = DEFAULT_COLORS;
        this.heatColors = DEFAULT_HEAT_COLORS;
        this.heat = [];
        this.animations = [];
        this.animationFrame = null;
    }

    get seatData() {
        return this.getSeatData();
    }

    get layout() {
        return this.getLayout();
    }

    get interaction() {
        return this.getInteractionState?.() || {};
    }

    refreshHeat() {
        const seatData = this.seatData;
        if (!seatData) {
            this.heat = [];
            return;
        }
        const { rows, cols } = seatData;
        const heat = Array.from({ length: rows }, () => new Array(cols).fill(0));
        const idealRow = (rows - 1) * 0.55;
        const idealCol = (cols - 1) / 2;
        const maxRowDistance = Math.max(idealRow, rows - 1 - idealRow, 1);
        const maxColDistance = Math.max(idealCol, cols - 1 - idealCol, 1);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const seat = seatData.getSeat(row, col);
                if (seat.status === SEAT_STATUS.OCCUPIED) {
                    heat[row][col] = 0.88;
                    continue;
                }
                if (seat.isSelected) {
                    heat[row][col] = 0.72;
                    continue;
                }
                const rowDistance = Math.abs(row - idealRow) / maxRowDistance;
                const colDistance = Math.abs(col - idealCol) / maxColDistance;
                const distance = Math.sqrt(rowDistance ** 2 * 0.4 + colDistance ** 2 * 0.6);
                heat[row][col] = 0.08 + (1 - Math.pow(distance, 0.65)) * 0.78;
            }
        }
        this.heat = heat;
    }

    triggerSeatBounce(row, col) {
        this.animations.push({ row, col, start: this.now(), duration: 350 });
        if (!this.animationFrame) {
            this._runAnimations();
        }
    }

    _runAnimations() {
        const now = this.now();
        this.animations = this.animations.filter(animation => now - animation.start < animation.duration);
        this.redraw();
        if (this.animations.length > 0) {
            this.animationFrame = this.requestFrame(() => this._runAnimations());
        } else {
            this.animationFrame = null;
        }
    }

    _getAnimationScale(row, col) {
        for (const animation of this.animations) {
            if (animation.row === row && animation.col === col) {
                const progress = (this.now() - animation.start) / animation.duration;
                if (progress >= 1) {
                    return 1;
                }
                const scale = 1 + 0.28 * Math.sin(progress * Math.PI * 2.3) * Math.exp(-progress * 3.5);
                return Math.max(0.7, Math.min(1.35, scale));
            }
        }
        return 1;
    }

    redraw() {
        const layout = this.layout;
        if (!layout) {
            return;
        }
        const { displayWidth: width, displayHeight: height } = layout;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, width, height);
        const background = ctx.createLinearGradient(0, 0, 0, height);
        background.addColorStop(0, '#F8FAFC');
        background.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = this.colors.bgGrid;
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 48) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += 48) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        this._drawScreen();
        this._drawColumnLabels();
        this._drawRowLabels();
        this._drawSeats();
        this._drawDragBox();
        this._drawTooltip();
        this._drawLegend();
        this._drawHallInfo();
    }

    _drawScreen() {
        const ctx = this.ctx;
        const { arcX, displayHeight, pitch, topPad, virtualCols } = this.layout;
        const screenWidth = virtualCols * pitch * 0.78;
        const screenX = arcX - screenWidth / 2;
        const screenY = topPad * 0.38;
        const lightHeight = displayHeight * 0.42;
        const spread = 70;

        ctx.save();
        ctx.beginPath();
        const sampleCount = 50;
        for (let index = 0; index <= sampleCount; index++) {
            const progress = index / sampleCount;
            const x = screenX - spread + progress * (screenWidth + spread * 2);
            const y = screenY - 28 * progress * (1 - progress);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.lineTo(screenX + screenWidth + spread, screenY + lightHeight);
        ctx.lineTo(screenX - spread, screenY + lightHeight);
        ctx.closePath();
        const light = ctx.createLinearGradient(0, screenY - 14, 0, screenY + lightHeight);
        light.addColorStop(0, 'rgba(37,99,235,0.28)');
        light.addColorStop(0.18, 'rgba(37,99,235,0.10)');
        light.addColorStop(0.45, 'rgba(37,99,235,0.03)');
        light.addColorStop(1, 'rgba(37,99,235,0)');
        ctx.fillStyle = light;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.quadraticCurveTo(arcX, screenY - 14, screenX + screenWidth, screenY);
        ctx.strokeStyle = this.colors.screen;
        ctx.lineWidth = 3;
        ctx.stroke();
        const bar = ctx.createLinearGradient(0, screenY - 8, 0, screenY + 8);
        bar.addColorStop(0, 'rgba(37,99,235,0.45)');
        bar.addColorStop(0.5, 'rgba(59,130,246,0.60)');
        bar.addColorStop(1, 'rgba(37,99,235,0.10)');
        ctx.fillStyle = bar;
        ctx.fillRect(screenX, screenY - 3, screenWidth, 6);
        ctx.fillStyle = '#2563EB';
        ctx.font = 'bold 13px "Microsoft YaHei","PingFang SC",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCREEN  银  幕', arcX, screenY - 18);
    }

    _drawColumnLabels() {
        const { cols } = this.seatData;
        const { positions, topPad } = this.layout;
        const firstRow = positions[0];
        if (!firstRow || cols < 6) {
            return;
        }
        this.ctx.fillStyle = this.colors.rowLabel;
        this.ctx.font = '9px "Microsoft YaHei",sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        const step = Math.max(1, Math.floor(cols / 12));
        for (let col = 0; col < cols; col += step) {
            const position = firstRow[col];
            if (position) {
                this.ctx.fillText(`${col + 1}`, position.cx, topPad - 4);
            }
        }
    }

    _drawRowLabels() {
        const { rows } = this.seatData;
        const { positions, seatSize } = this.layout;
        this.ctx.fillStyle = this.colors.rowLabel;
        this.ctx.font = `${Math.max(10, seatSize * 0.5)}px "Microsoft YaHei",sans-serif`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        for (let row = 0; row < rows; row++) {
            const position = positions[row][0];
            this.ctx.fillText(`${row + 1}排`, position.x - seatSize / 2 - 8, position.cy);
        }
    }

    _drawSeats() {
        const { rows, cols } = this.seatData;
        const { hover } = this.interaction;
        for (let row = rows - 1; row >= 0; row--) {
            for (let col = 0; col < cols; col++) {
                const hovered = hover?.row === row && hover?.col === col;
                this._drawSeat(this.layout.positions[row][col], this.seatData.getSeat(row, col), hovered, row, col);
            }
        }
    }

    _drawSeat(position, seat, hovered, row, col) {
        const ctx = this.ctx;
        const { seatSize } = this.layout;
        const { x, y } = position;
        const radius = Math.max(3, seatSize * 0.25);
        const scale = this._getAnimationScale(row, col);
        if (scale !== 1) {
            const centerX = x + seatSize / 2;
            const centerY = y + seatSize / 2;
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(scale, scale);
            ctx.translate(-centerX, -centerY);
        }

        const heatValue = this.heat[row]?.[col] || 0;
        const heatColor = heatValue > 0.6
            ? this.heatColors.hot
            : heatValue > 0.3 ? this.heatColors.warm : this.heatColors.cold;
        const heatStroke = `rgb(${heatColor.r},${heatColor.g},${heatColor.b})`;

        if (hovered && seat.status !== SEAT_STATUS.OCCUPIED) {
            const centerX = x + seatSize / 2;
            const centerY = y + seatSize / 2;
            const haloPadding = seatSize * 0.6;
            const halo = ctx.createRadialGradient(
                centerX, centerY, seatSize * 0.18,
                centerX, centerY, (seatSize + haloPadding) / 2
            );
            const haloColor = seat.isSelected
                ? '245,158,11'
                : seat.isRecommended ? '139,92,246' : '229,231,235';
            halo.addColorStop(0, `rgba(${haloColor},0.50)`);
            halo.addColorStop(0.4, `rgba(${haloColor},0.15)`);
            halo.addColorStop(1, `rgba(${haloColor},0)`);
            ctx.fillStyle = halo;
            this._roundedRect(
                x - haloPadding / 2,
                y - haloPadding / 2,
                seatSize + haloPadding,
                seatSize + haloPadding,
                radius + 3
            );
            ctx.fill();
        }

        let fill;
        let stroke;
        if (seat.status === SEAT_STATUS.OCCUPIED) {
            fill = this.colors.sold;
            stroke = heatStroke;
        } else if (seat.isSelected) {
            fill = this.colors.select;
            stroke = this.colors.selectStroke;
        } else if (seat.isRemoteHeld) {
            fill = this.colors.remote;
            stroke = this.colors.remoteStroke;
        } else if (seat.isRecommended) {
            fill = this.colors.recommended;
            stroke = this.colors.recommendedStroke;
        } else {
            fill = this.colors.avail;
            stroke = heatStroke;
        }
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        this._roundedRect(x, y, seatSize, seatSize, radius);
        ctx.fill();
        ctx.stroke();

        if (seat.isSelected) {
            ctx.fillStyle = '#1C1917';
            ctx.font = `bold ${Math.max(9, seatSize * 0.48)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', x + seatSize / 2, y + seatSize / 2);
        } else if (seat.isRemoteHeld) {
            ctx.fillStyle = '#78350F';
            ctx.font = `bold ${Math.max(9, seatSize * 0.42)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('…', x + seatSize / 2, y + seatSize / 2);
        }
        if (scale !== 1) {
            ctx.restore();
        }
    }

    _drawDragBox() {
        const { isDragging, dragStart, dragEnd } = this.interaction;
        if (!isDragging || !dragStart || !dragEnd) {
            return;
        }
        const { positions, seatSize } = this.layout;
        const start = positions[dragStart.row][dragStart.col];
        const end = positions[dragEnd.row][dragEnd.col];
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x) + seatSize;
        const height = Math.abs(end.y - start.y) + seatSize;
        this.ctx.save();
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeStyle = this.colors.dragLine;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        this.ctx.setLineDash([]);
        this.ctx.restore();
    }

    _drawTooltip() {
        const { tooltip } = this.interaction;
        if (!tooltip) {
            return;
        }
        const seat = this.seatData.getSeat(tooltip.row, tooltip.col);
        if (!seat) {
            return;
        }
        const { displayWidth, positions, seatSize } = this.layout;
        const position = positions[tooltip.row][tooltip.col];
        const text = `${tooltip.row + 1}排${tooltip.col + 1}座  ¥${seat.price}`;
        this.ctx.font = '12px "Microsoft YaHei",sans-serif';
        const width = this.ctx.measureText(text).width + 16;
        const height = 26;
        let x = position.cx - width / 2;
        let y = position.y - height - 6;
        if (y < 4) {
            y = position.y + seatSize + 6;
        }
        x = Math.max(4, Math.min(x, displayWidth - width - 4));
        this.ctx.fillStyle = this.colors.tooltipBg;
        this.ctx.strokeStyle = this.colors.tooltipBorder;
        this.ctx.lineWidth = 1;
        this._roundedRect(x, y, width, height, 6);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.fillStyle = this.colors.tooltipText;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x + width / 2, y + height / 2);
    }

    _drawLegend() {
        const heat = level => {
            const color = this.heatColors[level];
            return `rgb(${color.r},${color.g},${color.b})`;
        };
        const items = [
            { color: this.colors.avail, text: '空座', border: heat('hot') },
            { color: this.colors.select, text: '已选', border: this.colors.selectStroke },
            { color: this.colors.sold, text: '已售', border: this.colors.soldStroke },
            { color: this.colors.recommended, text: '推荐', border: this.colors.recommendedStroke },
            { color: heat('hot'), text: '热门(中)' },
            { color: heat('warm'), text: '一般' },
            { color: heat('cold'), text: '冷门(边)' }
        ];
        const { displayWidth, displayHeight } = this.layout;
        const y = displayHeight - 26;
        const startX = displayWidth - items.length * 68 - 10;
        this.ctx.font = '11px "Microsoft YaHei",sans-serif';
        items.forEach((item, index) => {
            const x = startX + index * 68;
            this.ctx.fillStyle = item.color;
            this.ctx.fillRect(x, y - 5, 10, 10);
            if (item.border) {
                this.ctx.strokeStyle = item.border;
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeRect(x, y - 5, 10, 10);
            }
            this.ctx.fillStyle = this.colors.legend;
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(item.text, x + 14, y);
        });
    }

    _drawHallInfo() {
        const hall = HALL_CONFIG[this.seatData.hallType];
        this.ctx.fillStyle = this.colors.hallInfo;
        this.ctx.font = '11px "Microsoft YaHei",sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${hall.name}·${hall.desc}·${hall.total}座`, 10, this.layout.displayHeight - 22);
    }

    _roundedRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.arcTo(x + width, y, x + width, y + radius, radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.arcTo(x, y + height, x, y + height - radius, radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.arcTo(x, y, x + radius, y, radius);
        this.ctx.closePath();
    }

    setColorblindMode(enabled) {
        this.colors = enabled ? COLORBLIND_COLORS : DEFAULT_COLORS;
        this.heatColors = enabled ? COLORBLIND_HEAT_COLORS : DEFAULT_HEAT_COLORS;
        this.redraw();
    }
}
