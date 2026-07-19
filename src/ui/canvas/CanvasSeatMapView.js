const HEAT_PERIODS = Object.freeze([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'week'
]);

const PERIOD_FACTORS = Object.freeze({
    monday: 0.72,
    tuesday: 0.76,
    wednesday: 0.82,
    thursday: 0.88,
    friday: 1.08,
    saturday: 1.18,
    sunday: 1.04,
    week: 0.92
});

export const HEAT_PERIOD_LABELS = Object.freeze({
    monday: '周一',
    tuesday: '周二',
    wednesday: '周三',
    thursday: '周四',
    friday: '周五',
    saturday: '周六',
    sunday: '周日',
    week: '一周综合'
});

function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, value));
}

function hashSeatPeriod(seat, period) {
    const source = `${seat.id}:${period}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
}

export function heatScoreForPeriod(seat, popularity, period = 'week') {
    const normalizedPeriod = HEAT_PERIODS.includes(period) ? period : 'week';
    const base = clamp(Number(popularity?.score || 0) / 100);
    if (normalizedPeriod === 'week') return Math.round(base * 100);

    const dayFactor = PERIOD_FACTORS[normalizedPeriod];
    const deterministicVariation = (hashSeatPeriod(seat, normalizedPeriod) - 0.5) * 0.16;
    const weekendCenterLift = ['friday', 'saturday', 'sunday'].includes(normalizedPeriod) &&
        seat.sectionId === 'center' ? 0.06 : 0;
    return Math.round(clamp(base * dayFactor + deterministicVariation + weekendCenterLift) * 100);
}

export function createCurvedSeatLayout(auditorium, {
    readable = false,
    top = 142,
    sidePadding = 62
} = {}) {
    if (!auditorium?.seats?.length) return Object.freeze({ width: 0, height: 0, seats: [] });
    const maxColumnIndex = Math.max(...auditorium.seats.map(seat => seat.columnIndex));
    const maxRowIndex = Math.max(...auditorium.seats.map(seat => seat.rowIndex));
    const columnCount = maxColumnIndex + 1;
    const seatWidth = readable ? 29 : 25;
    const seatHeight = readable ? 23 : 20;
    const columnStep = readable ? 39 : 34;
    const rowStep = readable ? 39 : 34;
    const aisleGap = readable ? 22 : 18;
    const curveDepth = columnCount <= 10 ? 10 : (columnCount <= 20 ? 15 : 20);
    const sectionByColumn = new Map();
    auditorium.seats.forEach(seat => {
        if (!sectionByColumn.has(seat.columnIndex)) {
            sectionByColumn.set(seat.columnIndex, seat.sectionId);
        }
    });
    const aisleAfterColumns = [];
    for (let columnIndex = 0; columnIndex < maxColumnIndex; columnIndex++) {
        if (sectionByColumn.get(columnIndex) !== sectionByColumn.get(columnIndex + 1)) {
            aisleAfterColumns.push(columnIndex);
        }
    }
    const aisleCountBefore = columnIndex =>
        aisleAfterColumns.filter(boundary => boundary < columnIndex).length;
    const horizontalOffset = columnIndex =>
        columnIndex * columnStep + aisleCountBefore(columnIndex) * aisleGap;
    const contentWidth = Math.max(1, horizontalOffset(maxColumnIndex));
    const width = Math.max(
        columnCount <= 10 ? 430 : (columnCount <= 20 ? 760 : 1120),
        contentWidth + sidePadding * 2
    );
    const startX = (width - contentWidth) / 2;
    const halfSpan = contentWidth / 2;

    const seats = auditorium.seats.map(seat => {
        const seatOffsetX = horizontalOffset(seat.columnIndex);
        const normalizedX = halfSpan === 0 ? 0 : (seatOffsetX - halfSpan) / halfSpan;
        // The auditorium opens toward the screen: each row dips at the visual centre
        // and rises toward both aisles instead of forming an upward arch.
        const curveOffset = curveDepth * (1 - normalizedX * normalizedX);
        const x = startX + seatOffsetX;
        const y = top + seat.rowIndex * rowStep + curveOffset;
        const slope = halfSpan === 0 ? 0 : (-2 * curveDepth * normalizedX) / halfSpan;
        return Object.freeze({
            ...seat,
            x,
            y,
            centerX: x + seatWidth / 2,
            centerY: y + seatHeight / 2,
            width: seatWidth,
            height: seatHeight,
            rotation: Math.atan(slope)
        });
    });
    const height = top + maxRowIndex * rowStep + curveDepth + seatHeight + 54;
    return Object.freeze({
        width,
        height,
        seatWidth,
        seatHeight,
        columnStep,
        columnCount,
        rowCount: maxRowIndex + 1,
        curveDepth,
        aisleGap,
        aisleAfterColumns: Object.freeze(aisleAfterColumns),
        seats: Object.freeze(seats)
    });
}

export function hitTestSeat(layout, x, y) {
    for (let index = layout.seats.length - 1; index >= 0; index--) {
        const seat = layout.seats[index];
        const padding = 5;
        if (x >= seat.x - padding && x <= seat.x + seat.width + padding &&
            y >= seat.y - padding && y <= seat.y + seat.height + padding) {
            return seat;
        }
    }
    return null;
}

export function seatsInsideRectangle(layout, rectangle) {
    const left = Math.min(rectangle.startX, rectangle.endX);
    const right = Math.max(rectangle.startX, rectangle.endX);
    const top = Math.min(rectangle.startY, rectangle.endY);
    const bottom = Math.max(rectangle.startY, rectangle.endY);
    return layout.seats.filter(seat =>
        seat.centerX >= left && seat.centerX <= right &&
        seat.centerY >= top && seat.centerY <= bottom
    );
}

export function centerTextMetricsInRectangle(metrics, rectangle, {
    fallbackAscent = 0,
    fallbackDescent = 0
} = {}) {
    const left = Number.isFinite(metrics?.actualBoundingBoxLeft) ?
        metrics.actualBoundingBoxLeft : 0;
    const right = Number.isFinite(metrics?.actualBoundingBoxRight) ?
        metrics.actualBoundingBoxRight : Number(metrics?.width || 0);
    const ascent = Number.isFinite(metrics?.actualBoundingBoxAscent) ?
        metrics.actualBoundingBoxAscent : fallbackAscent;
    const descent = Number.isFinite(metrics?.actualBoundingBoxDescent) ?
        metrics.actualBoundingBoxDescent : fallbackDescent;
    const centerX = rectangle.x + rectangle.width / 2;
    const centerY = rectangle.y + rectangle.height / 2;

    // With textAlign="left", the measured ink spans from originX - left to
    // originX + right. Solve for the origin rather than assuming advance-width
    // centring, which is visibly wrong for asymmetric glyphs such as 1 and 11.
    return Object.freeze({
        x: centerX - (right - left) / 2,
        baselineY: centerY + (ascent - descent) / 2
    });
}

function parseColor(value, fallback) {
    const match = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const hex = match[1];
    return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16)
    ];
}

function mixColor(left, right, amount) {
    return left.map((channel, index) => Math.round(channel + (right[index] - channel) * amount));
}

function colorAt(stops, value) {
    const normalized = clamp(value);
    const rightIndex = stops.findIndex(stop => stop.at >= normalized);
    if (rightIndex <= 0) return stops[0].color;
    const left = stops[rightIndex - 1];
    const right = stops[rightIndex];
    const amount = (normalized - left.at) / Math.max(0.001, right.at - left.at);
    return mixColor(left.color, right.color, amount);
}

export function readCanvasTheme(element = document.body) {
    const styles = getComputedStyle(element);
    const rootStyles = getComputedStyle(document.documentElement);
    const value = name => styles.getPropertyValue(name).trim() || rootStyles.getPropertyValue(name).trim();
    return Object.freeze({
        stage: value('--commerce-stage') || '#101319',
        stageMuted: value('--commerce-stage-muted') || '#262b34',
        stageText: value('--commerce-stage-text') || '#f5f7fb',
        accent: value('--commerce-accent') || '#d43f45',
        premium: value('--commerce-premium') || '#e0b35b',
        accessible: value('--commerce-accessible') || '#4e93c6',
        heatCool: '#7eaee4',
        heatWarm: '#e7ba54',
        heatHot: '#ef8a72',
        highContrast: element.classList.contains('commerce-high-contrast'),
        colorblind: element.classList.contains('commerce-colorblind'),
        readable: element.classList.contains('commerce-readable'),
        reduceMotion: document.documentElement.dataset.commerceMotion === 'reduce' ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
    });
}

export function createHeatmapBitmap({
    layout,
    popularityBySeat,
    period,
    theme,
    scale = 4
}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(layout.width / scale));
    canvas.height = Math.max(1, Math.ceil(layout.height / scale));
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    const cool = parseColor(theme.heatCool, [126, 174, 228]);
    const warm = parseColor(theme.heatWarm, [231, 186, 84]);
    const hot = parseColor(theme.heatHot, [239, 138, 114]);
    const accent = parseColor(theme.accent, [212, 63, 69]);
    const stops = [
        { at: 0, color: cool },
        { at: 0.52, color: cool },
        { at: 0.68, color: warm },
        { at: 0.84, color: hot },
        { at: 1, color: accent }
    ];
    const radius = layout.columnCount >= 30 ? 84 : (layout.columnCount >= 20 ? 76 : 68);
    const radiusSquared = radius * radius;
    const samples = layout.seats.map(seat => ({
        x: seat.centerX,
        y: seat.centerY,
        heat: heatScoreForPeriod(seat, popularityBySeat[seat.id], period) / 100
    }));
    const topEdge = Math.min(...layout.seats.map(seat => seat.centerY)) - radius * 0.55;
    const bottomEdge = Math.max(...layout.seats.map(seat => seat.centerY)) + radius * 0.55;
    const leftEdge = Math.min(...layout.seats.map(seat => seat.centerX)) - radius * 0.55;
    const rightEdge = Math.max(...layout.seats.map(seat => seat.centerX)) + radius * 0.55;

    for (let pixelY = 0; pixelY < canvas.height; pixelY++) {
        const y = pixelY * scale + scale / 2;
        for (let pixelX = 0; pixelX < canvas.width; pixelX++) {
            const x = pixelX * scale + scale / 2;
            if (x < leftEdge || x > rightEdge || y < topEdge || y > bottomEdge) continue;
            let weightedHeat = 0;
            let totalWeight = 0;
            for (const sample of samples) {
                const dx = x - sample.x;
                const dy = y - sample.y;
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared > radiusSquared * 4) continue;
                const weight = Math.exp(-distanceSquared / (2 * radiusSquared));
                weightedHeat += sample.heat * weight;
                totalWeight += weight;
            }
            if (totalWeight < 0.035) continue;
            const heat = clamp(weightedHeat / totalWeight);
            const horizontalFade = clamp(Math.min(x - leftEdge, rightEdge - x) / radius);
            const verticalFade = clamp(Math.min(y - topEdge, bottomEdge - y) / radius);
            const coverage = Math.min(horizontalFade, verticalFade, clamp(totalWeight / 1.65));
            const [red, green, blue] = colorAt(stops, heat);
            const alpha = Math.round(255 * coverage * (theme.highContrast ? 0.22 : 0.36));
            const offset = (pixelY * canvas.width + pixelX) * 4;
            image.data[offset] = red;
            image.data[offset + 1] = green;
            image.data[offset + 2] = blue;
            image.data[offset + 3] = alpha;
        }
    }
    context.putImageData(image, 0, 0);
    return canvas;
}

export function prepareCanvas(canvas, width, height) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return context;
}

export function canvasPoint(canvas, event) {
    const bounds = canvas.getBoundingClientRect();
    const scaleX = Number.parseFloat(canvas.style.width) / Math.max(1, bounds.width);
    const scaleY = Number.parseFloat(canvas.style.height) / Math.max(1, bounds.height);
    return Object.freeze({
        x: (event.clientX - bounds.left) * scaleX,
        y: (event.clientY - bounds.top) * scaleY
    });
}

export default createCurvedSeatLayout;
