import { recommendSeats } from '../application/recommendation/RecommendSeats.js';
import { snapshotSeatData } from '../ui/adapters/SeatDataLayoutAdapter.js';

/**
 * 迁移期兼容适配器；推荐规则由 application/recommendation 的纯用例实现。
 */
export class RecommendEngine {
    constructor(seatData) {
        this.seatData = seatData;
    }

    recommend(ageGroup, groupSize, movieType) {
        const result = recommendSeats(snapshotSeatData(this.seatData), {
            ageGroup,
            groupSize,
            movieType
        });
        if (!result.ok) {
            return {
                success: false,
                message: result.error.message,
                code: result.error.code
            };
        }
        return {
            success: true,
            seats: result.value.seats.map(seat => ({ row: seat.row, col: seat.col })),
            reason: result.value.reason
        };
    }
}

export default RecommendEngine;
