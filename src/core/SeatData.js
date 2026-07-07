/**
 * SeatData - 座位数据管理层
 * 负责电影院座位数据的组织、查询、更新
 */

export class SeatData {
    constructor(rows = 10, cols = 20) {
        this.rows = rows;
        this.cols = cols;
        this.seats = this.initializeSeats();
        this.selectedSeats = new Set();
        this.recommendedSeats = new Set();
    }

    /**
     * 初始化座位数据
     * 每个座位对象包含: {row, col, status, price}
     * status: available(可用), occupied(已占用), vip(VIP位置)
     */
    initializeSeats() {
        const seats = [];
        for (let row = 0; row < this.rows; row++) {
            seats[row] = [];
            for (let col = 0; col < this.cols; col++) {
                const status = this.getRandomStatus();
                seats[row][col] = {
                    row,
                    col,
                    status,
                    price: this.getPriceByPosition(row, col),
                    isSelected: false,
                    isRecommended: false
                };
            }
        }
        return seats;
    }

    /**
     * 随机生成座位状态（模拟真实情况）
     */
    getRandomStatus() {
        const rand = Math.random();
        if (rand < 0.7) return 'available';
        if (rand < 0.95) return 'occupied';
        return 'vip';
    }

    /**
     * 根据位置计算座位价格
     * 中心位置更贵，边缘便宜
     */
    getPriceByPosition(row, col) {
        const centerRow = this.rows / 2;
        const centerCol = this.cols / 2;
        const distToCenter = Math.abs(row - centerRow) + Math.abs(col - centerCol);
        const maxDist = centerRow + centerCol;
        const priceRange = [60, 120];
        return Math.round(priceRange[0] + (1 - distToCenter / maxDist) * (priceRange[1] - priceRange[0]));
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
     * 检查座位是否可用
     */
    isSeatAvailable(row, col) {
        const seat = this.getSeat(row, col);
        return seat && seat.status === 'available' && !seat.isSelected;
    }

    /**
     * 选择座位
     */
    selectSeat(row, col) {
        const seat = this.getSeat(row, col);
        if (seat && seat.status === 'available') {
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
            this.deselectSeat(row, col);
        });
        this.selectedSeats.clear();
    }

    /**
     * 设置推荐座位
     */
    setRecommended(seats) {
        this.recommendedSeats.clear();
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
            if (seat) {
                seat.isRecommended = false;
            }
        });
        this.recommendedSeats.clear();
    }

    /**
     * 获取统计信息
     */
    getStats() {
        let available = 0, occupied = 0, vip = 0, selected = 0;
        
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const seat = this.seats[row][col];
                if (seat.isSelected) selected++;
                else if (seat.status === 'available') available++;
                else if (seat.status === 'occupied') occupied++;
                else if (seat.status === 'vip') vip++;
            }
        }

        return { available, occupied, vip, selected, total: this.rows * this.cols };
    }

    /**
     * 获取已选座位列表
     */
    getSelectedSeats() {
        const selected = [];
        this.selectedSeats.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            selected.push(this.getSeat(row, col));
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
            recommended.push(this.getSeat(row, col));
        });
        return recommended;
    }

    /**
     * 计算两个座位的距离（曼哈顿距离）
     */
    getDistance(row1, col1, row2, col2) {
        return Math.abs(row1 - row2) + Math.abs(col1 - col2);
    }

    /**
     * 获取座位的热度指数（基于周围已占用座位数）
     */
    getHeatIndex(row, col) {
        let occupied = 0;
        for (let r = row - 2; r <= row + 2; r++) {
            for (let c = col - 2; c <= col + 2; c++) {
                if (r !== row || c !== col) {
                    const seat = this.getSeat(r, c);
                    if (seat && (seat.status === 'occupied' || seat.isSelected)) {
                        occupied++;
                    }
                }
            }
        }
        return occupied / 24; // 最多 24 个邻近座位
    }
}
