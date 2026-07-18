export function calculateCinemaLayout({ rows, cols, availableWidth, availableHeight }) {
    if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0) {
        throw new TypeError('Cinema layout 需要有效 rows/cols');
    }
    const widthLimit = Math.min(Math.max(280, availableWidth), 1100);
    const heightLimit = Math.min(Math.max(300, availableHeight), 680);
    const pitch = cols <= 10 ? 38 : cols <= 20 ? 30 : 22;
    const seatSize = Math.round(pitch * 0.78);
    const aisleCols = cols >= 14 ? 2 : cols >= 8 ? 1 : 0;
    const virtualCols = cols + aisleCols;
    const aisleStart = Math.floor((virtualCols - aisleCols) / 2);
    const topPad = 85;
    const bottomPad = 45;
    const requiredWidth = 120 + virtualCols * pitch + 80;
    const requiredHeight = topPad + rows * pitch + bottomPad + 20;
    const displayWidth = Math.round(Math.min(requiredWidth, widthLimit));
    const displayHeight = Math.round(Math.min(requiredHeight, heightLimit));
    const seatTop = topPad + pitch;
    const seatHeight = displayHeight - seatTop - bottomPad;
    const rowStep = rows > 1 ? seatHeight / (rows - 1) : 0;
    const arcX = displayWidth / 2;
    const initialRadius = displayWidth * 1.3;
    const positions = [];

    for (let row = 0; row < rows; row++) {
        const rowY = seatTop + row * rowStep;
        const radius = initialRadius + row * pitch * 0.55;
        const angleStep = pitch / radius;
        const totalAngle = (virtualCols - 1) * angleStep;
        const startAngle = -totalAngle / 2;
        const half = seatSize / 2;
        const rowPositions = [];
        let seatCol = 0;
        for (let virtualCol = 0; virtualCol < virtualCols; virtualCol++) {
            if (
                aisleCols > 0 &&
                virtualCol >= aisleStart &&
                virtualCol < aisleStart + aisleCols
            ) continue;
            const angle = startAngle + virtualCol * angleStep;
            const centerX = arcX + radius * Math.sin(angle);
            rowPositions[seatCol++] = Object.freeze({
                x: centerX - half,
                y: rowY - half,
                cx: centerX,
                cy: rowY
            });
        }
        positions[row] = Object.freeze(rowPositions);
    }

    return Object.freeze({
        rows,
        cols,
        displayWidth,
        displayHeight,
        seatSize,
        pitch,
        aisleStart,
        aisleCols,
        virtualCols,
        topPad,
        bottomPad,
        arcX,
        positions: Object.freeze(positions)
    });
}

export function hitTestCinemaSeat(layout, point, padding = 3) {
    for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
            const position = layout.positions[row][col];
            if (
                point.x >= position.x - padding &&
                point.x <= position.x + layout.seatSize + padding &&
                point.y >= position.y - padding &&
                point.y <= position.y + layout.seatSize + padding
            ) return { row, col };
        }
    }
    return null;
}

export default calculateCinemaLayout;
