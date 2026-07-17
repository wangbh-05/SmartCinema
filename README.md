# SmartCinema - 智能影院选座系统

## 📋 项目概览

SmartCinema 是《Web前端技术实训》2026夏清华大学软件学院大作业，基于原生 Web 技术栈开发的智能影院选座系统。

包含以下核心功能：

- 🎬 **三个放映厅**: 小厅100座（10排×10座）、中厅200座（10排×20座）、大厅300座（10排×30座），Canvas API 绘制弧形座位布局
- 🔐 **用户认证**: 注册/登录，会员资格，管理员后台
- 🤖 **智能推荐算法**: 根据年龄、人数、观影类型推荐最佳座位（少年避开前三排、老年人避开后三排、情侣中间双座等）
- 📊 **观影体验评分**: 视角、与银幕距离、周围空位情况综合评分，与观众评分综合计算
- 🔥 **热度地图**: 座位边框与独立热度图用红/黄/蓝标识热门、一般、冷门区域，支持一周内动态变化
- ♿ **无障碍支持**: 大字体、高对比度、色盲友好、语音提示
- 💾 **数据持久化**: 使用 LocalStorage 保存选座和订单信息

## 🚀 快速开始

### 安装依赖
```bash
cd SmartCinema
npm install  # 实际上此项目无外部依赖
```

### 启动开发服务器
```bash
npm start
```

然后在浏览器中打开 `http://localhost:8080`

### 运行测试
```bash
npm test
```

## 📁 项目结构

```
SmartCinema/
├── index.html              # 主应用 HTML 文件
├── package.json            # 项目配置
├── public/
│   └── styles/            # 样式文件
│       ├── reset.css       # 重置样式
│       ├── variables.css   # CSS 变量定义
│       ├── layout.css      # 布局样式
│       ├── components.css  # 组件样式
│       ├── responsive.css  # 响应式设计
│       └── accessibility.css  # 无障碍样式
├── src/
│   ├── app.js             # 主应用入口
│   ├── core/
│   │   ├── SeatData.js    # 座位数据管理
│   │   └── Cinema.js      # Canvas 影院引擎
│   ├── modules/
│   │   ├── RecommendEngine.js  # 推荐算法
│   │   ├── ScoreEngine.js      # 体验评分
│   │   └── HeatmapEngine.js    # 独立热度地图
│   └── utils/
│       └── storage.js     # 本地存储管理
└── tests/
    ├── test-seatdata.js   # SeatData 单元测试
    ├── test-recommend.js  # RecommendEngine 单元测试
    ├── test-score.js      # ScoreEngine 单元测试
    ├── test-order.js      # OrderManager 单元测试
    └── runner.js          # 测试运行器
```

## 🎯 核心模块说明

### 用户认证
负责用户注册、登录验证和管理员后台。

**功能:**
- 用户注册获得会员资格
- 登录认证后方可操作
- 管理员后台操作入口

### SeatData - 座位数据管理层
负责三个放映厅座位数据的组织、查询和更新。

**放映厅规格:**
| 放映厅 | 座位总数 | 排数 | 每排座位数 |
|--------|---------|------|-----------|
| 小厅   | 100座   | 10排 | 每排10座  |
| 中厅   | 200座   | 10排 | 每排20座  |
| 大厅   | 300座   | 10排 | 每排30座  |

**座位颜色:**
- 🟢 空座（绿色）
- 🟡 选中未售（黄色）
- 🔴 已售（红色）

**主要方法:**
- `selectSeat(row, col)` - 选择座位
- `deselectSeat(row, col)` - 取消选择
- `getStats()` - 获取统计信息
- `setRecommended(seats)` - 标记推荐座位

### Cinema - Canvas 绘图引擎
使用 HTML5 Canvas 绘制影院布局，实现弧形座位排列和选择交互。

**特性:**
- 弧形座位排列
- 完整的坐标映射（Canvas → 座位坐标）
- 事件委托处理（支持点击、多选、拖拽）
- 触屏支持
- 动态重绘机制

### RecommendEngine - 智能推荐算法
根据用户输入生成个性化推荐。

**观众分类:** 成年人、老年人、少年
**选座类型:** 个人票、情侣票、家庭票、团体票

**排座规则:**
- 少年（15岁以下）：不能坐前三排
- 老年人（60岁以上）：不能坐最后3排
- 情侣：优先推荐中间区域连续双座
- 家庭：优先推荐中后排连续座位
- 团体票（5-20人）：必须坐同一排，混合年龄需遵循各自规则

### ScoreEngine - 体验评分引擎
对用户选择的座位进行综合评分。

**评分指标:**
- 视角
- 与银幕距离
- 周围空位情况

**评分结果:** 极佳、优秀、一般
**综合计算:** 系统评分 + 观众手动评分

### HeatmapEngine - 热度地图
使用独立 Canvas 热力图展示座位热度分布；主座位图也会用座位边框同步显示热度。

**色彩标识:**
- 🔴 热门区域（红色）
- 🟡 一般区域（黄色）
- 🔵 冷门区域（蓝色）

**动态显示:** 支持一周内的厅内热度区域变化

## 🎨 样式系统

### CSS 变量定义 (variables.css)
- **色彩系统**: 主色、次色、成功、警告、错误等
- **间距**: xs, sm, md, lg, xl, 2xl
- **圆角**: sm, md, lg, xl, full
- **阴影**: sm, md, lg, xl
- **过渡**: 快速、标准、缓慢

### 响应式设计 (responsive.css)
- PC 端 (1024px+)
- 平板设备 (768px - 1024px)
- 手机设备 (480px - 768px)
- 超小屏 (< 480px)

### 无障碍设计 (accessibility.css)
- 高对比度模式
- 大字体模式
- 键盘导航支持
- 颜色盲友好
- 屏幕阅读器优化

## 🧪 测试说明

### 运行所有测试
```bash
npm test
```

### 单个测试模块
```bash
# 运行 SeatData 测试
node tests/test-seatdata.js

# 运行推荐算法测试
node tests/test-recommend.js

# 运行评分引擎测试
node tests/test-score.js

# 运行订单管理测试
node tests/test-order.js
```

### 测试覆盖
- SeatData: 座位初始化、选择、统计等
- RecommendEngine: 推荐算法、参数验证等
- ScoreEngine: 评分计算、多维度评估
- OrderManager: 订单创建、确认、取消和统计

## 💾 数据持久化

所有数据通过 LocalStorage 保存：
- `smartcinema_seat_selection` - 当前选座状态
- `smartcinema_orders` - 订单历史
- `smartcinema_settings` - 用户设置

### 导出数据
点击"导出数据"按钮将数据导出为 JSON 文件。

### 导入数据
点击"导入数据"按钮从 JSON 文件恢复数据。

## ♿ 无障碍功能

### 键盘支持
- Tab - 在元素间导航
- Enter - 激活按钮/表单
- Space - 选中复选框

### 屏幕阅读器
- 所有交互元素有合适的 ARIA 标签
- 实时区域通知选座变更

### 视觉辅助
- 高对比度模式
- 大字体模式
- 深色模式支持

## 🔧 技术栈

- **语言**: Vanilla JavaScript (ES6+)
- **构建**: 无依赖，原生 HTML5 + CSS3
- **绘图**: Canvas API
- **存储**: LocalStorage
- **测试**: 内置单元测试框架

## 📋 开发流程

1. **设计** - 需求分析和 UI 设计
2. **实现** - 分模块实现核心功能
3. **测试** - 单元测试和集成测试
4. **优化** - 性能优化和无障碍改进
5. **发布** - 文档整理和版本发布

## 🎓 学习资源

- [Canvas API 文档](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [CSS 网格布局](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [Web 无障碍](https://www.w3.org/WAI/ARIA/apg/)
- [LocalStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

## 📝 许可证

MIT License - 可自由使用和修改

## 👥 贡献者

SmartCinema Team - AI 辅助开发学生项目

---

**最后更新**: 2024 年 6 月 29 日
