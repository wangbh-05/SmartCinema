/**
 * Storage - 本地存储管理工具
 * 负责 LocalStorage 的读写、数据持久化
 */

export class Storage {
    constructor(prefix = 'smartcinema_') {
        this.prefix = prefix;
    }

    /**
     * 保存数据到 LocalStorage
     */
    save(key, data) {
        try {
            const fullKey = this.prefix + key;
            const json = JSON.stringify(data);
            localStorage.setItem(fullKey, json);
            return true;
        } catch (error) {
            console.error('Storage save error:', error);
            return false;
        }
    }

    /**
     * 从 LocalStorage 读取数据
     */
    load(key, defaultValue = null) {
        try {
            const fullKey = this.prefix + key;
            const json = localStorage.getItem(fullKey);
            return json ? JSON.parse(json) : defaultValue;
        } catch (error) {
            console.error('Storage load error:', error);
            return defaultValue;
        }
    }

    /**
     * 删除存储的数据
     */
    remove(key) {
        try {
            const fullKey = this.prefix + key;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }

    /**
     * 清空所有该前缀的数据
     */
    clear() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(this.prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }

    /**
     * 保存选座数据
     */
    saveSeatSelection(seatData) {
        const selected = Array.from(seatData.selectedSeats);
        return this.save('seat_selection', {
            timestamp: new Date().toISOString(),
            seats: selected,
            stats: seatData.getStats()
        });
    }

    /**
     * 加载选座数据
     */
    loadSeatSelection() {
        return this.load('seat_selection');
    }

    /**
     * 保存订单
     */
    saveOrder(order) {
        const orders = this.load('orders', []);
        orders.push({
            ...order,
            id: 'ORDER_' + Date.now(),
            timestamp: new Date().toISOString()
        });
        return this.save('orders', orders);
    }

    /**
     * 加载所有订单
     */
    loadOrders() {
        return this.load('orders', []);
    }

    /**
     * 保存用户设置
     */
    saveSettings(settings) {
        return this.save('settings', settings);
    }

    /**
     * 加载用户设置
     */
    loadSettings() {
        return this.load('settings', {
            darkMode: false,
            accessibilityMode: false,
            colorblindMode: false,
            voiceEnabled: false,
            language: 'zh-CN'
        });
    }

    /**
     * 导出所有数据为 JSON
     */
    exportData() {
        const data = {
            seatSelection: this.loadSeatSelection(),
            orders: this.loadOrders(),
            settings: this.loadSettings(),
            exportTime: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * 从 JSON 导入数据
     */
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.seatSelection) this.save('seat_selection', data.seatSelection);
            if (data.orders) this.save('orders', data.orders);
            if (data.settings) this.save('settings', data.settings);
            return true;
        } catch (error) {
            console.error('Import data error:', error);
            return false;
        }
    }
}
