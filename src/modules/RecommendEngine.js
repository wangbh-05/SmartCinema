/**
 * RecommendEngine - 智能推荐算法
 * 根据用户输入（年龄、人数、观影类型）推荐最佳座位
 */

export class RecommendEngine {
    constructor(seatData) {
        this.seatData = seatData;
    }

    /**
     * 执行推荐
     * @param {string} ageGroup - 年龄段: youth, adult, senior
     * @param {number} groupSize - 人数
     * @param {string} movieType - 观影类型: couple, family, group, solo
     */
    recommend(ageGroup, groupSize, movieType) {
        // 验证参数
        if (groupSize < 1 || groupSize > 20) {
            return { success: false, message: '人数必须在 1-20 之间' };
        }

        // 获取基础推荐座位
        const candidates = this.getInitialCandidates(groupSize);
        if (candidates.length < groupSize) {
            return { success: false, message: '无足够连续座位可用' };
        }

        // 应用规则并评分
        const scored = candidates.map(seat => ({
            ...seat,
            score: this.calculateScore(seat, ageGroup, groupSize, movieType)
        }));

        // 排序并选择最佳推荐
        scored.sort((a, b) => b.score - a.score);
        const recommended = scored.slice(0, groupSize);

        return {
            success: true,
            seats: recommended,
            reason: this.generateReason(recommended, ageGroup, groupSize, movieType)
        };
    }

    /**
     * 获取初始候选座位（必须是连续且可用的座位）
     */
    getInitialCandidates(groupSize) {
        const { rows, cols } = this.seatData;
        const candidates = [];

        // 寻找连续可用座位
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col <= cols - groupSize; col++) {
                const group = [];
                let isValid = true;

                for (let i = 0; i < groupSize; i++) {
                    const seat = this.seatData.getSeat(row, col + i);
                    if (!seat || !this.seatData.isSeatAvailable(row, col + i)) {
                        isValid = false;
                        break;
                    }
                    group.push({ row, col: col + i });
                }

                if (isValid) {
                    candidates.push({ group, centerRow: row, centerCol: col + groupSize / 2 - 0.5 });
                }
            }
        }

        return candidates;
    }

    /**
     * 计算推荐座位的综合评分
     */
    calculateScore(candidate, ageGroup, groupSize, movieType) {
        let score = 0;

        // 1. 视野评分（距屏幕的距离）
        const viewScore = this.calculateViewScore(candidate, ageGroup);
        score += viewScore * 0.3;

        // 2. 舒适度评分（周围拥挤程度）
        const comfortScore = this.calculateComfortScore(candidate, groupSize);
        score += comfortScore * 0.25;

        // 3. 类型匹配评分
        const typeScore = this.calculateTypeScore(candidate, groupSize, movieType);
        score += typeScore * 0.25;

        // 4. 价格优化评分
        const priceScore = this.calculatePriceScore(candidate);
        score += priceScore * 0.2;

        return score;
    }

    /**
     * 视野评分：根据座位距屏幕的距离
     * 最佳视野：大约在第 3-7 排
     */
    calculateViewScore(candidate, ageGroup) {
        const { centerRow } = candidate;
        const { rows } = this.seatData;
        
        let optimalRow;
        if (ageGroup === 'youth') {
            optimalRow = rows * 0.5; // 青少年靠后
        } else if (ageGroup === 'senior') {
            optimalRow = rows * 0.3; // 老年人靠前，视距近
        } else {
            optimalRow = rows * 0.4; // 成人折中
        }

        const distance = Math.abs(centerRow - optimalRow);
        return Math.max(0, 1 - distance / (rows / 2));
    }

    /**
     * 舒适度评分：检查周围座位是否拥挤
     */
    calculateComfortScore(candidate, groupSize) {
        const { group } = candidate;
        let occupiedNeighbors = 0;
        let totalNeighborSeats = 0;

        group.forEach(({ row, col }) => {
            // 检查上下左右相邻座位
            const neighbors = [
                { row: row - 1, col },
                { row: row + 1, col },
                { row, col: col - 1 },
                { row, col: col + 1 }
            ];

            neighbors.forEach(({ row: nr, col: nc }) => {
                const seat = this.seatData.getSeat(nr, nc);
                if (seat) {
                    totalNeighborSeats++;
                    if (seat.status === 'occupied' || seat.isSelected) {
                        occupiedNeighbors++;
                    }
                }
            });
        });

        if (totalNeighborSeats === 0) return 1;
        return Math.max(0, 1 - occupiedNeighbors / totalNeighborSeats);
    }

    /**
     * 类型匹配评分：根据观影类型优化推荐
     */
    calculateTypeScore(candidate, groupSize, movieType) {
        const { group, centerCol } = candidate;
        const { cols } = this.seatData;

        let score = 0.5; // 基础分

        if (movieType === 'couple') {
            // 情侣：靠边，隐私性好
            const edgeDistance = Math.min(centerCol, cols - 1 - centerCol);
            score = 0.3 + (edgeDistance / (cols / 2)) * 0.5;
        } else if (movieType === 'family') {
            // 家庭：中心位置，便于管理
            const centerDistance = Math.abs(centerCol - cols / 2);
            score = 0.7 - (centerDistance / (cols / 2)) * 0.3;
        } else if (movieType === 'group') {
            // 团体：集中在一起
            const centerDistance = Math.abs(centerCol - cols / 2);
            score = 0.6 - (centerDistance / (cols / 2)) * 0.2;
        } else {
            // 个人：灵活
            score = 0.6;
        }

        return Math.min(1, Math.max(0, score));
    }

    /**
     * 价格优化评分：考虑座位价格
     */
    calculatePriceScore(candidate) {
        const { group } = candidate;
        let avgPrice = 0;

        group.forEach(({ row, col }) => {
            const seat = this.seatData.getSeat(row, col);
            if (seat) {
                avgPrice += seat.price;
            }
        });

        avgPrice /= group.length;
        // 价格越低分数越高
        return 1 - (avgPrice - 60) / (120 - 60);
    }

    /**
     * 生成推荐理由
     */
    generateReason(recommended, ageGroup, groupSize, movieType) {
        const ageNames = { youth: '青少年', adult: '成人', senior: '老年人' };
        const typeNames = { couple: '情侣', family: '家庭', group: '团体', solo: '个人' };

        let reason = `为 ${ageNames[ageGroup]} ${groupSize} 人的 ${typeNames[movieType]} 观影推荐：\n`;

        // 添加座位信息
        const seatStrings = recommended.map(s => {
            const col = String.fromCharCode(65 + s.row);
            return `${col}${s.col + 1}`;
        });

        reason += `推荐座位：${seatStrings.join(', ')}\n`;
        reason += `总价格：¥${recommended.reduce((sum, s) => sum + s.price, 0)}\n`;
        reason += `特点：这个位置观影体验最佳，兼顾视野、舒适度和价格。`;

        return reason;
    }
}
