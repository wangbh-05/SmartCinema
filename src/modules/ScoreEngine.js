import { scoreSelection } from '../application/scoring/ScoreSelection.js';
import { snapshotSeatData } from '../ui/adapters/SeatDataLayoutAdapter.js';

/**
 * 迁移期兼容适配器；评分规则由 application/scoring 的纯用例实现。
 */
export class ScoreEngine {
    constructor(seatData) {
        this.seatData = seatData;
    }

    calculateScore() {
        return scoreSelection(snapshotSeatData(this.seatData));
    }
}

export default ScoreEngine;
