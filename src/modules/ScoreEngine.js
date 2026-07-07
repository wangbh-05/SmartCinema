/**
 * ScoreEngine - 观影体验评分引擎
 * 根据选择的座位计算综合评分
 */

export class ScoreEngine {
    constructor(seatData) {
        this.seatData = seatData;
    }

    /**
     * 计算选择座位的综合体验评分
     * 输出三档：极佳(≥80) / 优秀(60-79) / 一般(<60)
     */
    calculateScore() {
        const selected = this.seatData.getSelectedSeats();

        if (selected.length === 0) {
            return {
                totalScore: 0,
                grade: '',
                gradeText: '',
                breakdown: {},
                message: '请先选择座位'
            };
        }

        const scores = {
            vision: this.calculateVisionScore(selected),
            comfort: this.calculateComfortScore(selected),
            screenDistance: this.calculateScreenDistanceScore(selected),
            price: this.calculatePriceScore(selected),
            overall: 0
        };

        // 计算总分（权重平均）→ 映射到 0-100
        // 权重参考真实影院评价体系：视角最重要，距离次之，舒适度与价格辅助
        scores.overall = (
            scores.vision * 0.35 +
            scores.screenDistance * 0.30 +
            scores.comfort * 0.20 +
            scores.price * 0.15
        );

        const totalScore = Math.round(scores.overall * 10);
        const grade = this._scoreToGrade(totalScore);

        return {
            totalScore,
            grade: grade.key,
            gradeText: grade.text,
            breakdown: scores,
            details: this.generateDetails(selected, scores),
            recommendations: this.generateRecommendations(selected, scores, grade)
        };
    }

    /** 将百分制评分映射到三档 */
    _scoreToGrade(score) {
        if (score >= 80) return { key: 'excellent', text: '极佳' };
        if (score >= 60) return { key: 'good', text: '优秀' };
        return { key: 'average', text: '一般' };
    }

    /**
     * 视野评分（1-10）
     */
    calculateVisionScore(seats) {
        const { rows } = this.seatData;
        let score = 0;

        seats.forEach(seat => {
            // 最佳视野范围：第 3-8 排
            const optimalStart = rows * 0.3;
            const optimalEnd = rows * 0.8;

            if (seat.row >= optimalStart && seat.row <= optimalEnd) {
                score += 10;
            } else if (seat.row < optimalStart) {
                // 太靠前
                const distance = optimalStart - seat.row;
                score += Math.max(5, 10 - distance);
            } else {
                // 太靠后
                const distance = seat.row - optimalEnd;
                score += Math.max(5, 10 - distance);
            }
        });

        return Math.min(10, score / seats.length);
    }

    /**
     * 舒适度评分（1-10）
     * 根据周围座位的拥挤程度
     */
    calculateComfortScore(seats) {
        let occupiedCount = 0;
        let totalAdjacentSeats = 0;

        seats.forEach(seat => {
            // 检查所有相邻座位（前后左右）
            const adjacent = [
                { row: seat.row - 1, col: seat.col },
                { row: seat.row + 1, col: seat.col },
                { row: seat.row, col: seat.col - 1 },
                { row: seat.row, col: seat.col + 1 },
                { row: seat.row - 1, col: seat.col - 1 },
                { row: seat.row - 1, col: seat.col + 1 },
                { row: seat.row + 1, col: seat.col - 1 },
                { row: seat.row + 1, col: seat.col + 1 }
            ];

            adjacent.forEach(({ row, col }) => {
                const adjacentSeat = this.seatData.getSeat(row, col);
                if (adjacentSeat) {
                    totalAdjacentSeats++;
                    if (adjacentSeat.status === 'occupied' || adjacentSeat.isSelected) {
                        if (!seats.includes(adjacentSeat)) {
                            occupiedCount++;
                        }
                    }
                }
            });
        });

        if (totalAdjacentSeats === 0) {
            return 10;
        }

        const occupancyRate = occupiedCount / totalAdjacentSeats;
        return Math.max(2, 10 - occupancyRate * 8);
    }

    /**
     * 屏幕距离评分（1-10）
     * 距离屏幕太近或太远都会影响体验
     */
    calculateScreenDistanceScore(seats) {
        const { rows } = this.seatData;
        let score = 0;

        seats.forEach(seat => {
            // 屏幕在最前面，row 越小离屏幕越近
            const distanceFromScreen = seat.row;
            const totalDistance = rows;

            // 最佳距离：0.3 ~ 0.7 处
            const optimalStart = totalDistance * 0.3;
            const optimalEnd = totalDistance * 0.7;

            if (distanceFromScreen >= optimalStart && distanceFromScreen <= optimalEnd) {
                score += 10;
            } else {
                const distance = Math.min(
                    Math.abs(distanceFromScreen - optimalStart),
                    Math.abs(distanceFromScreen - optimalEnd)
                );
                score += Math.max(4, 10 - distance);
            }
        });

        return Math.min(10, score / seats.length);
    }

    /**
     * 价格评分（1-10）
     * 基于座位价格与平均价格的比较
     */
    calculatePriceScore(seats) {
        const totalPrice = seats.reduce((sum, seat) => sum + seat.price, 0);
        const avgPrice = totalPrice / seats.length;

        // 价格范围 60-120
        const minPrice = 60;
        const maxPrice = 120;

        if (avgPrice < 70) {
            return 10; // 超便宜
        } else if (avgPrice < 90) {
            return 9; // 便宜
        } else if (avgPrice < 110) {
            return 8; // 中等
        } else {
            return Math.max(6, 14 - avgPrice / 10);
        }
    }

    /**
     * 生成评分详情
     */
    generateDetails(seats, scores) {
        const details = [];

        // 视野
        details.push({
            category: '视野质量',
            score: scores.vision.toFixed(1),
            maxScore: 10,
            description: this.getVisionDescription(scores.vision),
            emoji: '👁️'
        });

        // 舒适度
        details.push({
            category: '舒适度',
            score: scores.comfort.toFixed(1),
            maxScore: 10,
            description: this.getComfortDescription(scores.comfort),
            emoji: '🛋️'
        });

        // 屏幕距离
        details.push({
            category: '屏幕距离',
            score: scores.screenDistance.toFixed(1),
            maxScore: 10,
            description: this.getScreenDistanceDescription(scores.screenDistance),
            emoji: '📺'
        });

        // 价格
        details.push({
            category: '价格划算度',
            score: scores.price.toFixed(1),
            maxScore: 10,
            description: this.getPriceDescription(scores.price),
            emoji: '💰'
        });

        return details;
    }

    /**
     * 生成改进建议
     */
    generateRecommendations(seats, scores, grade) {
        const recommendations = [];

        if (scores.vision < 6) {
            recommendations.push({
                type: 'vision',
                message: '⚠️ 当前座位视野角度较差，建议选择中排座位以获得最佳视野'
            });
        }

        if (scores.comfort < 6) {
            recommendations.push({
                type: 'comfort',
                message: '⚠️ 周围座位较多，可能会比较拥挤，建议选择边区或较空闲区域'
            });
        }

        if (scores.screenDistance < 6) {
            recommendations.push({
                type: 'distance',
                message: '⚠️ 距离屏幕过近或过远，建议调整座位以获得最佳观影距离'
            });
        }

        if (grade.key === 'excellent') {
            recommendations.push({
                type: 'overall',
                message: '✨ 极佳！这是观影体验最好的座位之一，强烈推荐！'
            });
        } else if (grade.key === 'good') {
            recommendations.push({
                type: 'overall',
                message: '👍 优秀！观影体验不错的选择'
            });
        } else if (grade.key === 'average') {
            recommendations.push({
                type: 'overall',
                message: '💡 体验一般，建议试试中间区域的座位以获得更好体验'
            });
        }

        return recommendations;
    }

    /**
     * 视野描述
     */
    getVisionDescription(score) {
        if (score >= 9) return '极佳的视野角度';
        if (score >= 7) return '很好的视野角度';
        if (score >= 5) return '中等视野角度';
        return '视野角度较差';
    }

    /**
     * 舒适度描述
     */
    getComfortDescription(score) {
        if (score >= 9) return '周围空座很多，很宽敞';
        if (score >= 7) return '周围相对空闲，比较舒适';
        if (score >= 5) return '周围有一定人员，正常拥挤度';
        return '周围座位较多，有些拥挤';
    }

    /**
     * 屏幕距离描述
     */
    getScreenDistanceDescription(score) {
        if (score >= 9) return '完美的屏幕观看距离';
        if (score >= 7) return '很好的屏幕观看距离';
        if (score >= 5) return '可接受的屏幕观看距离';
        return '屏幕距离不够理想';
    }

    /**
     * 价格描述
     */
    getPriceDescription(score) {
        if (score >= 9) return '超划算！';
        if (score >= 7) return '价格相对便宜';
        if (score >= 5) return '价格居中';
        return '价格偏贵';
    }
}
