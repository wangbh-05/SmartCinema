/**
 * SeatData - 座位数据管理层
 * 负责三个放映厅座位数据的组织、查询、更新
 *
 * 放映厅规格：
 *   小厅: 10排 × 10座 = 100座
 *   中厅: 10排 × 20座 = 200座
 *   大厅: 10排 × 30座 = 300座
 */

// 三厅配置常量
export const HALL_CONFIG = {
    small:  { name: '小厅', rows: 10, cols: 10, total: 100, desc: '10排×10座' },
    medium: { name: '中厅', rows: 10, cols: 20, total: 200, desc: '10排×20座' },
    large:  { name: '大厅', rows: 10, cols: 30, total: 300, desc: '10排×30座' }
};

// 座位状态常量
export const SEAT_STATUS = {
    AVAILABLE: 'available',   // 空座（绿色）
    SELECTED:  'selected',    // 选中未售（黄色）
    OCCUPIED:  'occupied'     // 已售（红色）
};

export class SeatData {
    constructor(hallType = 'medium') {
        this.hallType = hallType;
        this.rows = HALL_CONFIG[hallType].rows;
        this.cols = HALL_CONFIG[hallType].cols;
        this.seats = [];
        this.selectedSeats = new Set();
        this.recommendedSeats = new Set();

        this.initializeSeats();
    }

    /**
     * 初始化座位数据
     * 默认全部为空座，随机模拟一些已售座位（约25%）
     */
    initializeSeats() {
        this.seats = [];
        for (let row = 0; row < this.rows; row++) {
            this.seats[row] = [];
            for (let col = 0; col < this.cols; col++) {
                // 随机模拟约25%的已售座位
                const isOccupied = Math.random() < 0.25;
                this.seats[row][col] = {
                    row,
                    col,
                    status: isOccupied ? SEAT_STATUS.OCCUPIED : SEAT_STATUS.AVAILABLE,
                    price: this.getPriceByPosition(row, col),
                    isSelected: false,
                    isRecommended: false
                };
            }
        }
        this.selectedSeats.clear();
        this.recommendedSeats.clear();
    }

    /**
     * 切换放映厅
     * @param {string} hallType - 'small' | 'medium' | 'large'
     */
    switchHall(hallType) {
        if (!HALL_CONFIG[hallType]) {
            console.error(`Invalid hall type: ${hallType}`);
            return false;
        }
        this.hallType = hallType;
        this.rows = HALL_CONFIG[hallType].rows;
        this.cols = HALL_CONFIG[hallType].cols;
        this.initializeSeats();
        return true;
    }

    /**
     * 获取当前放映厅配置
     */
    getHallConfig() {
        return HALL_CONFIG[this.hallType];
    }

    /**
     * 获取所有已售座位的 row-col 键
     */
    getAllOccupiedKeys() {
        const keys = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.seats[r][c].status === SEAT_STATUS.OCCUPIED) {
                    keys.push(`${r}-${c}`);
                }
            }
        }
        return keys;
    }

    /**
     * 根据位置计算座位价格（中心区域更贵）
     */
    getPriceByPosition(row, col) {
        const centerRow = this.rows / 2;
        const centerCol = this.cols / 2;
        const distToCenterRow = Math.abs(row - centerRow);
        const distToCenterCol = Math.abs(col - centerCol);

        // 第4-7排中心区域最贵
        if (row >= 3 && row <= 6 && distToCenterCol < this.cols * 0.3) {
            return 120; // 黄金区域
        } else if (row >= 2 && row <= 7) {
            return 100; // 中等区域
        } else if (distToCenterRow < 2 && distToCenterCol < this.cols * 0.4) {
            return 90;
        } else {
            return 60; // 边缘区域
        }
    }

    /**
     * 获取指定座位
     */
    getSeat(row, col) {
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
            return null;
        }
        return this.seats[row][col];
    }

    /**
     * 检查座位是否可用（未被占用且未被选中）
     */
    isSeatAvailable(row, col) {
        const seat = this.getSeat(row, col);
        return seat && seat.status === SEAT_STATUS.AVAILABLE && !seat.isSelected;
    }

    /**
     * 检查座位是否已被售出
     */
    isSeatOccupied(row, col) {
        const seat = this.getSeat(row, col);
        return seat && seat.status === SEAT_STATUS.OCCUPIED;
    }

    /**
     * 选择座位
     */
    selectSeat(row, col) {
        const seat = this.getSeat(row, col);
        if (seat && seat.status === SEAT_STATUS.AVAILABLE) {
            seat.isSelected = true;
            this.selectedSeats.add(`${row}-${col}`);
            return true;
        }
        return false;
    }

    /**
     * 取消选择座位
     */
    deselectSeat(row, col) {
        const seat = this.getSeat(row, col);
        if (seat) {
            seat.isSelected = false;
            this.selectedSeats.delete(`${row}-${col}`);
            return true;
        }
        return false;
    }

    /**
     * 清空所有选择
     */
    clearSelection() {
        this.selectedSeats.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.getSeat(row, col);
            if (seat) seat.isSelected = false;
        });
        this.selectedSeats.clear();
    }

    /**
     * 设置推荐座位
     */
    setRecommended(seats) {
        this.clearRecommended();
        seats.forEach(({ row, col }) => {
            const seat = this.getSeat(row, col);
            if (seat) {
                seat.isRecommended = true;
                this.recommendedSeats.add(`${row}-${col}`);
            }
        });
    }

    /**
     * 清空推荐座位
     */
    clearRecommended() {
        this.recommendedSeats.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.getSeat(row, col);
            if (seat) seat.isRecommended = false;
        });
        this.recommendedSeats.clear();
    }

    /**
     * 确认购票——将选中的座位标记为已售
     */
    confirmPurchase() {
        this.selectedSeats.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.getSeat(row, col);
            if (seat) {
                seat.status = SEAT_STATUS.OCCUPIED;
                seat.isSelected = false;
            }
        });
        this.selectedSeats.clear();
        this.clearRecommended();
    }

    /**
     * 退票——将已售座位恢复为空座
     */
    refundSeats(seatKeys) {
        seatKeys.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.getSeat(row, col);
            if (seat && seat.status === SEAT_STATUS.OCCUPIED) {
                seat.status = SEAT_STATUS.AVAILABLE;
            }
        });
    }

    /**
     * 获取统计信息
     */
    getStats() {
        let available = 0, occupied = 0, selected = 0;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const seat = this.seats[row][col];
                if (seat.isSelected) selected++;
                else if (seat.status === SEAT_STATUS.AVAILABLE) available++;
                else if (seat.status === SEAT_STATUS.OCCUPIED) occupied++;
            }
        }

        return {
            available,
            occupied,
            selected,
            total: this.rows * this.cols,
            hallType: this.hallType,
            hallName: HALL_CONFIG[this.hallType].name
        };
    }

    /**
     * 获取已选座位列表
     */
    getSelectedSeats() {
        const selected = [];
        this.selectedSeats.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.getSeat(row, col);
            if (seat) selected.push(seat);
        });
        return selected;
    }

    /**
     * 获取推荐座位列表
     */
    getRecommendedSeats() {
        const recommended = [];
        this.recommendedSeats.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const seat = this.getSeat(row, col);
            if (seat) recommended.push(seat);
        });
        return recommended;
    }

    /**
     * 查找同排连续空座
     * @param {number} row - 目标排
     * @param {number} count - 需要连续座位数
     * @returns {Array|null} 连续座位数组或null
     */
    findConsecutiveInRow(row, count) {
        if (row < 0 || row >= this.rows) return null;

        let consecutive = [];
        for (let col = 0; col < this.cols; col++) {
            if (this.isSeatAvailable(row, col)) {
                consecutive.push({ row, col });
                if (consecutive.length === count) {
                    return consecutive;
                }
            } else {
                consecutive = [];
            }
        }
        return null;
    }

    /**
     * 获取座位的热度指数（基于周围已售座位数）
     */
    getHeatIndex(row, col) {
        let occupied = 0;
        let total = 0;
        for (let r = row - 2; r <= row + 2; r++) {
            for (let c = col - 2; c <= col + 2; c++) {
                if (r === row && c === col) continue;
                const seat = this.getSeat(r, c);
                if (seat) {
                    total++;
                    if (seat.status === SEAT_STATUS.OCCUPIED || seat.isSelected) {
                        occupied++;
                    }
                }
            }
        }
        return total === 0 ? 0 : occupied / total;
    }

    /**
     * 序列化当前状态（用于 LocalStorage）
     */
    toJSON() {
        return {
            hallType: this.hallType,
            seats: this.seats.map(row =>
                row.map(seat => ({
                    row: seat.row,
                    col: seat.col,
                    status: seat.status,
                    price: seat.price
                }))
            )
        };
    }

    /**
     * 从 JSON 恢复状态
     */
    fromJSON(data) {
        if (!data || !data.seats) return;
        this.hallType = data.hallType || 'medium';
        this.rows = HALL_CONFIG[this.hallType].rows;
        this.cols = HALL_CONFIG[this.hallType].cols;
        this.seats = data.seats.map(row =>
            row.map(s => ({
                row: s.row,
                col: s.col,
                status: s.status,
                price: s.price || this.getPriceByPosition(s.row, s.col),
                isSelected: false,
                isRecommended: false
            }))
        );
        this.selectedSeats.clear();
        this.recommendedSeats.clear();
    }
}
