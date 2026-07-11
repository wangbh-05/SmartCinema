/**
 * AIChatbot — 观影问答式顾问
 * 基于关键词匹配的规则引擎，回答选座、影院相关问题
 */
export class AIChatbot {
    constructor(seatData) {
        this.sd = seatData;
        this.knowledge = this._buildKnowledge();
        this.history = [];
    }

    /** 知识库：关键词 → 回复模板 */
    _buildKnowledge() {
        const tips = [
            { keys: ['推荐','选座','哪个位置','坐哪里','推荐座位','帮我选','选什么'], reply: (ctx) => {
                const stats = ctx.stats;
                return `🎯 为您推荐：\n\n当前${ctx.hallName}有 **${stats.available}** 个空座。\n\n• 个人观影 → 中间区域第4-7排最佳\n• 情侣 → 中间双连座，兼顾视野与私密\n• 家庭 → 中后排连续座位\n• 团体 → 同排连座\n\n💡 试试右侧「智能推荐」面板，一键获取最佳座位！`;
            }},
            { keys: ['价格','多少钱','票价','费用','贵','便宜'], reply: (ctx) => {
                const stats = ctx.stats;
                return `💰 **票价说明**\n\n当前${ctx.hallName}共${stats.total}座，票价分四档：\n• 🥇 黄金区（第4-7排中央）：¥120\n• 🥈 优质区（第3-8排）：¥100\n• 🥉 标准区：¥90\n• 🏷️ 经济区（边缘）：¥60\n\n💡 热度边框越红 = 价格越高 = 观影体验越好`;
            }},
            { keys: ['热度','热门','冷门','哪个区域好','最好的'], reply: (ctx) => {
                return `🔥 **热度说明**\n\n座位边框颜色 = 热度等级：\n• 🔴 红色边框 = 热门黄金区（中间位置）\n• 🟠 琥珀边框 = 一般区域\n• 🔵 蓝色边框 = 冷门边缘区\n\n💡 热度基于真实影院定价模型，中间座位最受欢迎！\n📅 可通过Header日期选择器查看一周热度变化`;
            }},
            { keys: ['银幕','屏幕','视野','视角','距离','太近','太远'], reply: (ctx) => {
                return `📺 **观影距离指南**\n\n• 第1-2排：距离过近，需仰头观看\n• 第3-6排：**最佳视野** 🥇，画面充满视野\n• 第7-8排：舒适距离，适合长时间观影\n• 第9-10排：距离较远，细节可能不清晰\n\n💡 系统会根据您的选座自动计算视野评分！`;
            }},
            { keys: ['评分','打分','体验','几分','怎么样'], reply: (ctx) => {
                return `📊 **观影体验评分**\n\n系统从四个维度综合评估：\n• 👁️ 视野质量（35%）— 看屏幕的角度\n• 📺 屏幕距离（30%）— 与银幕的距离\n• 🛋️ 舒适度（20%）— 周围拥挤程度\n• 💰 价格（15%）— 性价比\n\n≥80极佳 | 60-79优秀 | <60一般\n\n💡 选座后自动评分，还可提交您的手动评分！`;
            }},
            { keys: ['厅','放映厅','小厅','中厅','大厅','切换','几个厅'], reply: (ctx) => {
                return `🏛️ **放映厅信息**\n\n• 🟢 小厅：10排×10座 = 100座（精致）\n• 🔵 中厅：10排×20座 = 200座（标准）\n• 🟣 大厅：10排×30座 = 300座（震撼）\n\n当前：**${ctx.hallName}**（${ctx.hallDesc}）\n\n💡 通过Header下拉菜单切换放映厅`;
            }},
            { keys: ['少年','小孩','儿童','孩子','老人','老年人','年龄','限制'], reply: () => {
                return `👶👴 **特殊人群座位规则**\n\n• 少年（<15岁）：禁止坐**前三排**，保护视力\n• 老年人（≥60岁）：禁止坐**后三排**，方便出入\n• 成年人：无限制\n\n💡 智能推荐会自动避开禁排区域！`;
            }},
            { keys: ['订单','买票','购票','支付','退票','取消','退款'], reply: () => {
                return `🛒 **订单流程**\n\n1. 选择座位（推荐或手动）\n2. 点击「提交订单」\n3. 在确认页查看详情\n4. 确认支付 或 取消返回\n\n💡 历史订单在侧边栏「查看历史订单」中查看\n💡 支持退票退款`;
            }},
            { keys: ['你好','嗨','hello','hi','在吗','帮助','help','功能'], reply: () => {
                return `👋 您好！我是 **SmartCinema 观影顾问** 🤖\n\n我可以帮您解答：\n• 🎯 选座推荐\n• 💰 票价说明\n• 🔥 热度解读\n• 📺 观影距离\n• 📊 体验评分\n• 🏛️ 放映厅信息\n• 👶 特殊人群规则\n• 🛒 订单流程\n\n直接输入您的问题吧～`;
            }},
            { keys: ['情侣','约会','二人','双人','两个人'], reply: () => {
                return `💑 **情侣选座建议**\n\n• 推荐中间区域（第4-7排）连续双座\n• 稍微偏侧边更有私密性\n• 避开过道两侧（人流多）\n\n💡 在推荐面板选择「2人→成年→情侣」，一键推荐最佳情侣座！`;
            }},
            { keys: ['家庭','家人','亲子','带孩子','全家'], reply: () => {
                return `👨‍👩‍👧 **家庭观影建议**\n\n• 推荐中后排（第5-8排）连续座位\n• 方便照顾小孩和老人\n• 周围空座多更舒适\n\n💡 在推荐面板选择人数→年龄段（含少年/老人）→家庭，系统自动避开禁排！`;
            }},
            { keys: ['朋友','组团','团体','多人','聚会'], reply: (ctx) => {
                return `👥 **团体观影建议**\n\n• 5-20人必须同排连续\n• 推荐中后排（第4-7排）\n• 越早选座越容易找到连排\n\n当前${ctx.hallName}有${ctx.stats.available}个空座。\n\n💡 在推荐面板选择人数→年龄段→朋友/团体即可！`;
            }},
            { keys: ['色盲','无障碍','字体','语音','大字体'], reply: () => {
                return `♿ **无障碍功能**\n\n• 🔊 语音提示：操作播报\n• 🎨 色盲友好模式：蓝/橙配色\n• 🔍 大字体模式：18px+\n• 🎛️ 高对比度模式\n\n💡 在页面底部「设置」区开启`;
            }},
        ];
        return tips;
    }

    /**
     * 处理用户输入，返回回复
     * @param {string} input — 用户输入文本
     * @returns {string} 回复文本
     */
    chat(input) {
        const q = input.trim().toLowerCase();
        if (!q) return '请告诉我您想了解什么？比如「推荐座位」「票价」「哪个位置好」';

        // 上下文数据
        const stats = this.sd.getStats();
        const hallConfig = this.sd.getHallConfig();
        const ctx = {
            stats,
            hallName: hallConfig.name,
            hallDesc: hallConfig.desc,
            hallType: this.sd.hallType,
        };

        // 关键词匹配
        let bestMatch = null, bestScore = 0;
        for (const item of this.knowledge) {
            let score = 0;
            for (const key of item.keys) {
                if (q.includes(key)) score += key.length;  // 更长关键词权重更高
            }
            if (score > bestScore) { bestScore = score; bestMatch = item; }
        }

        const reply = bestMatch
            ? (typeof bestMatch.reply === 'function' ? bestMatch.reply(ctx) : bestMatch.reply)
            : `🤔 抱歉，我没太理解您的问题。\n\n您可以试试问：\n• 「推荐座位」— 获取选座建议\n• 「多少钱」— 了解票价\n• 「哪个位置好」— 热度解读\n• 「怎么看评分」— 评分说明\n• 「帮助」— 查看全部功能`;

        this.history.push({ role: 'user', text: input });
        this.history.push({ role: 'bot', text: reply });
        if (this.history.length > 20) this.history.splice(0, 2);

        return reply;
    }

    /** 获取对话历史 */
    getHistory() { return [...this.history]; }

    /** 清空历史 */
    clearHistory() { this.history = []; }
}

export default AIChatbot;
