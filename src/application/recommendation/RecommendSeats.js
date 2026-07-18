import { err, ok } from '../../shared/Result.js';
import {
    findConsecutiveLayoutSeats,
    getLayoutHeatIndex,
    getLayoutSeat,
    isLayoutSeatAvailable
} from '../cinema/SeatLayoutSnapshot.js';

const AGE_GROUPS = new Set(['youth', 'adult', 'senior']);
const MOVIE_TYPES = new Set(['solo', 'couple', 'family', 'group', 'friends', 'parent_child']);

export function recommendSeats(layout, { ageGroup, groupSize, movieType }) {
    const invalid = validateInput(ageGroup, groupSize, movieType);
    if (invalid) return err('VALIDATION_ERROR', invalid);
    const engine = new RecommendationEngine(layout);
    const result = engine.recommend(ageGroup, groupSize, movieType);
    if (!result) {
        return err(
            'RECOMMENDATION_UNAVAILABLE',
            '抱歉，没有找到符合要求的连续座位，请尝试手动选座或更换放映厅'
        );
    }
    const seats = result.seats.map(seat => Object.freeze({
        seatKey: seat.seatKey,
        row: seat.row,
        col: seat.col,
        unitPrice: seat.price
    }));
    return ok(Object.freeze({
        seats: Object.freeze(seats),
        reason: engine.generateReason(seats, ageGroup, groupSize, movieType, result.strategy)
    }));
}

function validateInput(ageGroup, groupSize, movieType) {
    if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 20) {
        return '人数必须在 1-20 之间';
    }
    if (typeof ageGroup !== 'string') return '年龄段无效';
    const groups = ageGroup.split(',').filter(Boolean);
    if (groups.length === 0 || groups.some(group => !AGE_GROUPS.has(group))) return '年龄段无效';
    if (!MOVIE_TYPES.has(movieType)) return '观影类型无效';
    if (movieType === 'couple' && groupSize !== 2) return '情侣票必须为2人';
    if (movieType === 'family' && (groupSize < 3 || groupSize > 5)) return '家庭票建议3-5人';
    if (movieType === 'group' && groupSize < 5) return '团体票至少5人，最多20人';
    return null;
}

class RecommendationEngine {
    constructor(layout) {
        this.layout = layout;
    }

    recommend(ageGroup, groupSize, movieType) {
        const forbiddenRows = this.getForbiddenRows(ageGroup);
        switch (movieType) {
            case 'solo':
                return this.recommendSolo(forbiddenRows);
            case 'couple':
                return this.recommendCouple(forbiddenRows);
            case 'family':
            case 'parent_child':
                return this.recommendFamily(groupSize, forbiddenRows);
            case 'friends':
                return groupSize >= 2 ?
                    this.recommendFamily(groupSize, forbiddenRows) :
                    this.recommendSolo(forbiddenRows);
            case 'group':
                return this.recommendGroup(groupSize, forbiddenRows);
            default:
                return null;
        }
    }

    getForbiddenRows(ageGroup) {
        const forbidden = new Set();
        const groups = ageGroup.split(',');
        if (groups.includes('youth')) [0, 1, 2].forEach(row => forbidden.add(row));
        if (groups.includes('senior')) {
            [this.layout.rows - 3, this.layout.rows - 2, this.layout.rows - 1]
                .forEach(row => forbidden.add(row));
        }
        return forbidden;
    }

    scanAllRows(count, forbiddenRows, rowScorer) {
        const candidates = [];
        for (let row = 0; row < this.layout.rows; row++) {
            if (forbiddenRows.has(row)) continue;
            const seats = findConsecutiveLayoutSeats(this.layout, row, count);
            if (!seats) continue;
            candidates.push({ row, seats, score: rowScorer(row, seats) });
        }
        candidates.sort((left, right) => right.score - left.score);
        return candidates;
    }

    recommendSolo(forbiddenRows) {
        const { rows, cols } = this.layout;
        let bestSeat = null;
        let bestScore = -1;
        for (let row = 0; row < rows; row++) {
            if (forbiddenRows.has(row)) continue;
            for (let col = 0; col < cols; col++) {
                if (!isLayoutSeatAvailable(this.layout, row, col)) continue;
                let score = 50;
                score += (1 - Math.abs(row - rows * 0.45) / rows) * 30;
                score += (1 - Math.abs(col - cols / 2) / (cols / 2)) * 20;
                if (score > bestScore) {
                    bestScore = score;
                    bestSeat = getLayoutSeat(this.layout, row, col);
                }
            }
        }
        return bestSeat ? { seats: [bestSeat], strategy: '个人观影最佳位置' } : null;
    }

    recommendCouple(forbiddenRows) {
        const { cols } = this.layout;
        const candidates = this.scanAllRows(2, forbiddenRows, (row, seats) => {
            let score = row >= 3 && row <= 6 ? 50 : row >= 4 && row <= 7 ? 30 : 10;
            const averageCol = (seats[0].col + seats[1].col) / 2;
            score += (1 - Math.abs(averageCol - cols / 2) / (cols / 2)) * 30;
            const edgeDistance = Math.min(averageCol, cols - 1 - averageCol);
            if (edgeDistance >= 2 && edgeDistance <= cols * 0.3) score += 10;
            return score;
        });
        return candidates.length > 0 ? {
            seats: candidates[0].seats,
            strategy: '中间区域连续双座 (情侣优先)'
        } : null;
    }

    recommendFamily(groupSize, forbiddenRows) {
        const { cols } = this.layout;
        const candidates = this.scanAllRows(groupSize, forbiddenRows, (row, seats) => {
            let score = row >= 4 && row <= 8 ? 50 : row >= 3 && row <= 6 ? 35 : 10;
            const averageCol = seats.reduce((sum, seat) => sum + seat.col, 0) / seats.length;
            score += (1 - Math.abs(averageCol - cols / 2) / (cols / 2)) * 25;
            const emptyNeighbors = seats.reduce(
                (sum, seat) => sum + (1 - getLayoutHeatIndex(this.layout, seat.row, seat.col)),
                0
            );
            score += (emptyNeighbors / seats.length) * 25;
            return score;
        });
        return candidates.length > 0 ? {
            seats: candidates[0].seats,
            strategy: `中后排连续${groupSize}座 (家庭优先)`
        } : null;
    }

    recommendGroup(groupSize, forbiddenRows) {
        const { cols } = this.layout;
        const candidates = this.scanAllRows(groupSize, forbiddenRows, (row, seats) => {
            let score = row >= 3 && row <= 7 ? 40 : 20;
            const averageCol = seats.reduce((sum, seat) => sum + seat.col, 0) / seats.length;
            score += (1 - Math.abs(averageCol - cols / 2) / (cols / 2)) * 30;
            score += (seats.length / cols) * 30;
            return score;
        });
        return candidates.length > 0 ? {
            seats: candidates[0].seats,
            strategy: `同排连续${groupSize}座 (团体)`
        } : null;
    }

    generateReason(seats, ageGroup, groupSize, movieType, strategy) {
        const ageNames = { youth: '少年', adult: '成年人', senior: '老年人' };
        const typeNames = {
            solo: '个人观影',
            couple: '情侣',
            family: '家庭',
            group: '团体',
            friends: '朋友',
            parent_child: '亲子'
        };
        const groups = ageGroup.split(',');
        const lines = [
            `【${groups.map(group => ageNames[group] || group).join('+')} · ${typeNames[movieType]} · ${groupSize}人】`,
            `推荐策略: ${strategy}`,
            `推荐座位: ${seats.map(seat => `${seat.row + 1}排${seat.col + 1}座`).join('、')}`,
            `总价: ¥${seats.reduce((sum, seat) => sum + seat.unitPrice, 0)}`
        ];
        if (groups.includes('youth')) lines.push('📌 已避开前三排 (少年观影视力保护)');
        if (groups.includes('senior')) lines.push('📌 已避开最后三排 (老年人便利出行)');
        if (movieType === 'couple') lines.push('💑 中间区域双人连续座位，兼顾视野与私密性');
        else if (movieType === 'family') lines.push('👨‍👩‍👧 中后排连续座位，方便照顾家人');
        else if (movieType === 'group') lines.push('👥 同排连续座位，团体成员不分散');
        const averageRow = seats.reduce((sum, seat) => sum + seat.row, 0) / seats.length;
        if (averageRow >= 3 && averageRow <= 6) lines.push('✨ 该区域观影视角最佳');
        return lines.join('\n');
    }
}

export default recommendSeats;
