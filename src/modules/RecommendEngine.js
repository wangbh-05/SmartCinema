/**
 * RecommendEngine - 智能推荐算法
 *
 * 根据用户年龄、人数、观影类型推荐最佳座位。
 *
 * 硬约束规则（严格遵循大作业要求）：
 *   少年（15岁以下）：不能坐前三排（row 0-2）
 *   老年人（60岁以上）：不能坐最后三排（row 7-9）
 *   情侣：优先推荐中间区域连续双座
 *   家庭：优先推荐中后排连续座位
 *   团体（5-20人）：成员必须坐同一排连续座位
 *     团体中有老年人/少年需遵循上述规则
 *   非以上类别成年人：可随意坐
 */

import { SEAT_STATUS } from '../core/SeatData.js';

// 年龄分类
const AGE = { YOUTH: 'youth', ADULT: 'adult', SENIOR: 'senior' };
const TYPE = { SOLO: 'solo', COUPLE: 'couple', FAMILY: 'family', GROUP: 'group' };

// 硬约束定义
const CONSTRAINTS = {
    youth: {
        forbiddenRows: (rows) => [0, 1, 2],  // 不能坐前三排
    },
    senior: {
        forbiddenRows: (rows) => [rows - 3, rows - 2, rows - 1],  // 不能坐后三排
    },
};

export class RecommendEngine {
    constructor(seatData) {
        this.seatData = seatData;
    }

    /**
     * 执行推荐
     * @param {string} ageGroup - 'youth' | 'adult' | 'senior'
     * @param {number} groupSize - 人数 (1-20)
     * @param {string} movieType - 'solo' | 'couple' | 'family' | 'group'
     * @returns {{ success: boolean, seats: Array, reason: string, message?: string }}
     */
    recommend(ageGroup, groupSize, movieType) {
        const { rows, cols } = this.seatData;

        // 参数验证
        if (groupSize < 1 || groupSize > 20) {
            return { success: false, message: '人数必须在 1-20 之间' };
        }
        if (movieType === TYPE.COUPLE && groupSize !== 2) {
            return { success: false, message: '情侣票必须为2人' };
        }
        if (movieType === TYPE.FAMILY && (groupSize < 3 || groupSize > 5)) {
            return { success: false, message: '家庭票建议3-5人' };
        }
        if (movieType === TYPE.GROUP && (groupSize < 6)) {
            return { success: false, message: '团体票至少6人，最多20人' };
        }

        // 获取禁排
        const forbiddenRows = this._getForbiddenRows(ageGroup);

        // 根据类型执行不同推荐策略
        let result;
        switch (movieType) {
            case TYPE.SOLO:
                result = this._recommendSolo(ageGroup, forbiddenRows);
                break;
            case TYPE.COUPLE:
                result = this._recommendCouple(forbiddenRows);
                break;
            case TYPE.FAMILY:
                result = this._recommendFamily(groupSize, forbiddenRows);
                break;
            case 'friends':
                // 朋友：>=2人用家庭策略，1人用单人策略
                result = groupSize >= 2
                    ? this._recommendFamily(groupSize, forbiddenRows)
                    : this._recommendSolo(ageGroup, forbiddenRows);
                break;
            case 'parent_child':
                // 亲子：类似家庭，优先中后排
                result = this._recommendFamily(groupSize, forbiddenRows);
                break;
            case TYPE.GROUP:
                result = this._recommendGroup(groupSize, ageGroup, forbiddenRows);
                break;
            default:
                result = this._recommendSolo(ageGroup, forbiddenRows);
        }

        if (!result || !result.seats || result.seats.length === 0) {
            return { success: false, message: '抱歉，没有找到符合要求的连续座位，请尝试手动选座或更换放映厅' };
        }

        return {
            success: true,
            seats: result.seats,
            reason: this._generateReason(result.seats, ageGroup, groupSize, movieType, result.strategy)
        };
    }

    /* ================================================================
     * 辅助方法
     * ================================================================ */

    /** 获取某年龄段的禁排（支持逗号分隔的多年龄段） */
    _getForbiddenRows(ageGroup) {
        const { rows } = this.seatData;
        const forbidden = new Set();
        const groups = ageGroup.split(',');
        if (groups.includes(AGE.YOUTH)) {
            [0, 1, 2].forEach(r => forbidden.add(r));
        }
        if (groups.includes(AGE.SENIOR)) {
            [rows - 3, rows - 2, rows - 1].forEach(r => forbidden.add(r));
        }
        return forbidden;
    }

    /** 在指定行找连续空座 */
    _findConsecutive(row, count, forbiddenRows = new Set()) {
        if (forbiddenRows.has(row)) return null;
        return this.seatData.findConsecutiveInRow(row, count);
    }

    /** 遍历所有行找连续空座，按评分排序 */
    _scanAllRows(count, forbiddenRows, rowScorer) {
        const { rows } = this.seatData;
        const candidates = [];
        for (let r = 0; r < rows; r++) {
            if (forbiddenRows.has(r)) continue;
            const found = this._findConsecutive(r, count, forbiddenRows);
            if (found) {
                candidates.push({
                    row: r,
                    seats: found,
                    score: rowScorer ? rowScorer(r, found) : 0
                });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates;
    }

    /** 中间列范围 */
    _isCenter(col, cols) {
        const center = cols / 2;
        return Math.abs(col - center) < cols * 0.35;
    }

    /** 中后排 (row 4-8) */
    _isMidBack(row, rows) {
        return row >= Math.floor(rows * 0.4) && row <= rows - 2;
    }

    /** 中间区域 (row 2-7) */
    _isMiddle(row, rows) {
        return row >= 2 && row <= rows - 3;
    }

    /* ================================================================
     * 个人推荐
     * ================================================================ */

    _recommendSolo(ageGroup, forbiddenRows) {
        const { rows, cols } = this.seatData;
        let bestSeat = null;
        let bestScore = -1;

        for (let r = 0; r < rows; r++) {
            if (forbiddenRows.has(r)) continue;
            for (let c = 0; c < cols; c++) {
                if (!this.seatData.isSeatAvailable(r, c)) continue;
                // 评分：中间位置最优
                let score = 50;
                score += (1 - Math.abs(r - rows * 0.45) / rows) * 30;  // 行偏好
                score += (1 - Math.abs(c - cols / 2) / (cols / 2)) * 20;  // 列中心
                if (score > bestScore) {
                    bestScore = score;
                    bestSeat = { row: r, col: c };
                }
            }
        }

        return bestSeat
            ? { seats: [bestSeat], strategy: `个人观影最佳位置` }
            : null;
    }

    /* ================================================================
     * 情侣推荐 — 优先中间区域连续双座
     * ================================================================ */

    _recommendCouple(forbiddenRows) {
        const { rows, cols } = this.seatData;

        // 优先级: 中间区域 (row 3-6) > 中后排 (row 4-7) > 其他
        const candidates = this._scanAllRows(2, forbiddenRows, (r, seats) => {
            let score = 0;
            // 中间行优先
            if (r >= 3 && r <= 6) score += 50;
            else if (r >= 4 && r <= 7) score += 30;
            else score += 10;
            // 靠中心列
            const avgCol = (seats[0].col + seats[1].col) / 2;
            score += (1 - Math.abs(avgCol - cols / 2) / (cols / 2)) * 30;
            // 稍微偏侧边也有加分（私密性）
            const edgeDist = Math.min(avgCol, cols - 1 - avgCol);
            if (edgeDist >= 2 && edgeDist <= cols * 0.3) score += 10;
            return score;
        });

        return candidates.length > 0
            ? { seats: candidates[0].seats, strategy: '中间区域连续双座 (情侣优先)' }
            : null;
    }

    /* ================================================================
     * 家庭推荐 — 优先中后排连续座位
     * ================================================================ */

    _recommendFamily(groupSize, forbiddenRows) {
        const { rows, cols } = this.seatData;

        // 优先级: 中后排 (row 4-8) > 中间排 (3-6) > 其他
        const candidates = this._scanAllRows(groupSize, forbiddenRows, (r, seats) => {
            let score = 0;
            if (r >= 4 && r <= 8) score += 50;       // 中后排最优
            else if (r >= 3 && r <= 6) score += 35;
            else score += 10;
            const avgCol = seats.reduce((s, st) => s + st.col, 0) / seats.length;
            score += (1 - Math.abs(avgCol - cols / 2) / (cols / 2)) * 25;
            // 周围空位多加分（家庭需要空间）
            const emptyNeighbors = seats.reduce((sum, s) =>
                sum + (1 - this.seatData.getHeatIndex(s.row, s.col)), 0);
            score += (emptyNeighbors / seats.length) * 25;
            return score;
        });

        return candidates.length > 0
            ? { seats: candidates[0].seats, strategy: `中后排连续${groupSize}座 (家庭优先)` }
            : null;
    }

    /* ================================================================
     * 团体推荐 — 必须同排连续 (5-20人)
     * ================================================================ */

    _recommendGroup(groupSize, ageGroup, forbiddenRows) {
        const { rows, cols } = this.seatData;

        // 团体票必须同一排，且含老人/少年要遵循各自规则
        // 找所有满足的行（一整排连续 groupSize 个座位）
        const candidates = this._scanAllRows(groupSize, forbiddenRows, (r, seats) => {
            let score = 0;
            // 中后排更适合团体
            if (r >= 3 && r <= 7) score += 40;
            else score += 20;
            const avgCol = seats.reduce((s, st) => s + st.col, 0) / seats.length;
            score += (1 - Math.abs(avgCol - cols / 2) / (cols / 2)) * 30;
            // 行越长越好（团体希望在一起）
            score += (seats.length / cols) * 30;
            return score;
        });

        return candidates.length > 0
            ? { seats: candidates[0].seats, strategy: `同排连续${groupSize}座 (团体)` }
            : null;
    }

    /* ================================================================
     * 推荐理由生成
     * ================================================================ */

    _generateReason(seats, ageGroup, groupSize, movieType, strategy) {
        const ageNames = { youth: '少年', adult: '成年人', senior: '老年人' };
        const typeNames = { solo: '个人观影', couple: '情侣', family: '家庭', group: '团体', friends: '朋友', parent_child: '亲子' };
        const { rows } = this.seatData;

        const seatStrs = seats.map(s => `${s.row + 1}排${s.col + 1}座`);
        const totalPrice = seats.reduce((sum, s) => {
            const seat = this.seatData.getSeat(s.row, s.col);
            return sum + (seat ? seat.price : 0);
        }, 0);

        // 多年龄段友好显示
        const groups = ageGroup.split(',');
        const ageLabel = groups.map(g => ageNames[g] || g).join('+');

        let lines = [];
        lines.push(`【${ageLabel} · ${typeNames[movieType] || '观影'} · ${groupSize}人】`);
        lines.push(`推荐策略: ${strategy}`);
        lines.push(`推荐座位: ${seatStrs.join('、')}`);
        lines.push(`总价: ¥${totalPrice}`);

        // 规则说明（支持多年龄段）
        if (groups.includes(AGE.YOUTH)) {
            lines.push('📌 已避开前三排 (少年观影视力保护)');
        }
        if (groups.includes(AGE.SENIOR)) {
            lines.push('📌 已避开最后三排 (老年人便利出行)');
        }
        if (movieType === TYPE.COUPLE) {
            lines.push('💑 中间区域双人连续座位，兼顾视野与私密性');
        } else if (movieType === TYPE.FAMILY) {
            lines.push('👨‍👩‍👧 中后排连续座位，方便照顾家人');
        } else if (movieType === TYPE.GROUP) {
            lines.push('👥 同排连续座位，团体成员不分散');
        }

        // 体验预估
        const avgRow = seats.reduce((s, r) => s + r.row, 0) / seats.length;
        if (avgRow >= 3 && avgRow <= 6) {
            lines.push('✨ 该区域观影视角最佳');
        }

        return lines.join('\n');
    }
}
