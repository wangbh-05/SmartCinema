import { err, ok } from '../../shared/Result.js';
import { getLayoutSeat, getSelectedLayoutSeats } from '../cinema/SeatLayoutSnapshot.js';

const MANUAL_WEIGHTS = Object.freeze({
    vision: 0.35,
    distance: 0.30,
    comfort: 0.20,
    price: 0.15
});

export function scoreSelection(layout) {
    const selected = getSelectedLayoutSeats(layout);
    if (selected.length === 0) {
        return Object.freeze({
            totalScore: 0,
            grade: '',
            gradeText: '',
            breakdown: Object.freeze({}),
            details: Object.freeze([]),
            recommendations: Object.freeze([]),
            message: '请先选择座位'
        });
    }
    const scores = {
        vision: calculateVisionScore(layout, selected),
        comfort: calculateComfortScore(layout, selected),
        screenDistance: calculateScreenDistanceScore(layout, selected),
        price: calculatePriceScore(selected),
        overall: 0
    };
    scores.overall = (
        scores.vision * MANUAL_WEIGHTS.vision +
        scores.screenDistance * MANUAL_WEIGHTS.distance +
        scores.comfort * MANUAL_WEIGHTS.comfort +
        scores.price * MANUAL_WEIGHTS.price
    );
    const totalScore = Math.round(scores.overall * 10);
    const grade = scoreToGrade(totalScore);
    return Object.freeze({
        totalScore,
        grade: grade.key,
        gradeText: grade.text,
        breakdown: Object.freeze({ ...scores }),
        details: Object.freeze(generateDetails(scores).map(Object.freeze)),
        recommendations: Object.freeze(generateRecommendations(scores, grade).map(Object.freeze))
    });
}

export function combineScores(systemScore, manualInput) {
    if (!systemScore || !Number.isInteger(systemScore.totalScore) || systemScore.totalScore <= 0) {
        return err('SELECTION_EMPTY', '请先选择座位');
    }
    const normalized = {};
    for (const key of Object.keys(MANUAL_WEIGHTS)) {
        const value = Number(manualInput?.[key]);
        if (!Number.isFinite(value) || value < 0 || value > 10) {
            return err('VALIDATION_ERROR', `${key} 评分必须在 0-10 之间`);
        }
        normalized[key] = value;
    }
    const manualOverall = Object.entries(MANUAL_WEIGHTS)
        .reduce((sum, [key, weight]) => sum + normalized[key] * weight, 0);
    const manualTotal = Math.round(manualOverall * 10);
    const totalScore = Math.round(systemScore.totalScore * 0.6 + manualTotal * 0.4);
    const grade = scoreToGrade(totalScore);
    return ok(Object.freeze({
        manualScore: Object.freeze({
            ...normalized,
            totalScore: manualTotal
        }),
        combinedScore: Object.freeze({
            systemTotal: systemScore.totalScore,
            manualTotal,
            totalScore,
            grade: grade.key,
            gradeText: grade.text
        })
    }));
}

function scoreToGrade(score) {
    if (score >= 80) return { key: 'excellent', text: '极佳' };
    if (score >= 60) return { key: 'good', text: '优秀' };
    return { key: 'average', text: '一般' };
}

function calculateVisionScore(layout, seats) {
    let score = 0;
    seats.forEach(seat => {
        const optimalStart = layout.rows * 0.3;
        const optimalEnd = layout.rows * 0.8;
        if (seat.row >= optimalStart && seat.row <= optimalEnd) score += 10;
        else if (seat.row < optimalStart) score += Math.max(5, 10 - (optimalStart - seat.row));
        else score += Math.max(5, 10 - (seat.row - optimalEnd));
    });
    return Math.min(10, score / seats.length);
}

function calculateComfortScore(layout, seats) {
    const selectedKeys = new Set(seats.map(seat => seat.seatKey));
    let occupiedCount = 0;
    let totalAdjacentSeats = 0;
    seats.forEach(seat => {
        const adjacent = [
            [seat.row - 1, seat.col],
            [seat.row + 1, seat.col],
            [seat.row, seat.col - 1],
            [seat.row, seat.col + 1],
            [seat.row - 1, seat.col - 1],
            [seat.row - 1, seat.col + 1],
            [seat.row + 1, seat.col - 1],
            [seat.row + 1, seat.col + 1]
        ];
        adjacent.forEach(([row, col]) => {
            const adjacentSeat = getLayoutSeat(layout, row, col);
            if (!adjacentSeat) return;
            totalAdjacentSeats++;
            const occupied = adjacentSeat.status === 'occupied' || adjacentSeat.isSelected;
            if (occupied && !selectedKeys.has(adjacentSeat.seatKey)) occupiedCount++;
        });
    });
    if (totalAdjacentSeats === 0) return 10;
    return Math.max(2, 10 - (occupiedCount / totalAdjacentSeats) * 8);
}

function calculateScreenDistanceScore(layout, seats) {
    let score = 0;
    const optimalStart = layout.rows * 0.3;
    const optimalEnd = layout.rows * 0.7;
    seats.forEach(seat => {
        if (seat.row >= optimalStart && seat.row <= optimalEnd) {
            score += 10;
            return;
        }
        const distance = Math.min(
            Math.abs(seat.row - optimalStart),
            Math.abs(seat.row - optimalEnd)
        );
        score += Math.max(4, 10 - distance);
    });
    return Math.min(10, score / seats.length);
}

function calculatePriceScore(seats) {
    const averagePrice = seats.reduce((sum, seat) => sum + seat.price, 0) / seats.length;
    if (averagePrice < 70) return 10;
    if (averagePrice < 90) return 9;
    if (averagePrice < 110) return 8;
    return Math.max(6, 14 - averagePrice / 10);
}

function generateDetails(scores) {
    return [
        {
            category: '视野质量',
            score: scores.vision.toFixed(1),
            maxScore: 10,
            description: describeVision(scores.vision),
            emoji: '👁️'
        },
        {
            category: '舒适度',
            score: scores.comfort.toFixed(1),
            maxScore: 10,
            description: describeComfort(scores.comfort),
            emoji: '🛋️'
        },
        {
            category: '屏幕距离',
            score: scores.screenDistance.toFixed(1),
            maxScore: 10,
            description: describeDistance(scores.screenDistance),
            emoji: '📺'
        },
        {
            category: '价格划算度',
            score: scores.price.toFixed(1),
            maxScore: 10,
            description: describePrice(scores.price),
            emoji: '💰'
        }
    ];
}

function generateRecommendations(scores, grade) {
    const recommendations = [];
    if (scores.vision < 6) {
        recommendations.push({ type: 'vision', message: '⚠️ 当前座位视野角度较差，建议选择中排座位以获得最佳视野' });
    }
    if (scores.comfort < 6) {
        recommendations.push({ type: 'comfort', message: '⚠️ 周围座位较多，可能会比较拥挤，建议选择边区或较空闲区域' });
    }
    if (scores.screenDistance < 6) {
        recommendations.push({ type: 'distance', message: '⚠️ 距离屏幕过近或过远，建议调整座位以获得最佳观影距离' });
    }
    if (grade.key === 'excellent') {
        recommendations.push({ type: 'overall', message: '✨ 极佳！这是观影体验最好的座位之一，强烈推荐！' });
    } else if (grade.key === 'good') {
        recommendations.push({ type: 'overall', message: '👍 优秀！观影体验不错的选择' });
    } else {
        recommendations.push({ type: 'overall', message: '💡 体验一般，建议试试中间区域的座位以获得更好体验' });
    }
    return recommendations;
}

function describeVision(score) {
    if (score >= 9) return '极佳的视野角度';
    if (score >= 7) return '很好的视野角度';
    if (score >= 5) return '中等视野角度';
    return '视野角度较差';
}

function describeComfort(score) {
    if (score >= 9) return '周围空座很多，很宽敞';
    if (score >= 7) return '周围相对空闲，比较舒适';
    if (score >= 5) return '周围有一定人员，正常拥挤度';
    return '周围座位较多，有些拥挤';
}

function describeDistance(score) {
    if (score >= 9) return '完美的屏幕观看距离';
    if (score >= 7) return '很好的屏幕观看距离';
    if (score >= 5) return '可接受的屏幕观看距离';
    return '屏幕距离不够理想';
}

function describePrice(score) {
    if (score >= 9) return '超划算！';
    if (score >= 7) return '价格相对便宜';
    if (score >= 5) return '价格居中';
    return '价格偏贵';
}

export default scoreSelection;
