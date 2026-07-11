# SmartCinema 智能影院选座系统 — 项目报告

> **课程**：Web前端技术实训（2026夏季学期）
> **选题**：大作业一 SmartCinema 智能影院选座系统
> **提交日期**：2026年7月

---

## 组员信息

| 角色 | 姓名 | 学号 | 邮箱 |
|------|------|------|------|
| 组长 | `[填写姓名]` | `[填写学号]` | `[填写邮箱]` |
| 组员 | `[填写姓名]` | `[填写学号]` | `[填写邮箱]` |
| 组员 | `[填写姓名]` | `[填写学号]` | `[填写邮箱]` |

> **组名**：`[填写组名]`

---

## 一、项目概述

SmartCinema 是一款基于纯前端技术的智能影院选座系统，使用 Canvas 2D API 绘制弧形影院座位图，集成智能推荐算法、热度地图、观影体验评分和无障碍支持。

### 核心特性

- **弧形座位布局**：圆环弧线算法，三放映厅切换（100/200/300座）
- **智能推荐引擎**：硬约束规则（少年禁前三排/老人禁后三排/团体同排连续）+ 级联表单
- **影院热度地图**：边框颜色常驻显示 + 一周动态切换
- **观影体验评分**：四维度系统评分 + 观众手动评分综合
- **无障碍支持**：语音提示、色盲友好模式、大字体、高对比度
- **订单系统**：独立确认页 + LocalStorage 持久化

---

## 二、项目结构

```
source/
├── index.html                  # 主页面
├── order.html                  # 订单确认页
├── src/
│   ├── app.js                  # 主应用逻辑
│   ├── core/
│   │   ├── Cinema.js           # Canvas 弧形影院绘图引擎
│   │   └── SeatData.js         # 座位数据管理
│   ├── modules/
│   │   ├── AuthManager.js      # 用户认证
│   │   ├── HeatmapEngine.js    # 热度引擎（已废弃，整合到Cinema）
│   │   ├── OrderManager.js     # 订单管理
│   │   ├── RecommendEngine.js  # 智能推荐
│   │   └── ScoreEngine.js      # 体验评分
│   └── utils/
│       ├── accessibility.js    # 无障碍工具
│       └── storage.js          # 本地存储
├── public/styles/
│   ├── accessibility.css       # 无障碍样式
│   ├── components.css          # 组件样式
│   ├── layout.css              # 布局
│   ├── reset.css               # 样式重置
│   ├── responsive.css          # 响应式
│   └── variables.css           # CSS 变量
├── doc/
│   ├── DESIGN.md               # 视觉设计文档
│   ├── USER_FLOW.md            # 用户流程图
│   └── AI_DEVELOPMENT.md       # AI开发说明书
└── tests/
    ├── runner.js
    ├── test-recommend.js
    ├── test-score.js
    └── test-seatdata.js
```

---

## 三、技术实现

### 3.1 Canvas 弧形影院引擎（Cinema.js）

- **布局算法**：固定行高 + 圆环弧线（`R = baseR + row × pitch × 0.55`），仅水平方向弯曲
- **银幕光锥**：二次贝塞尔曲线 + 纵向渐变光锥向下照射
- **交互**：单击独立切换、拖拽矩形框选、悬停径向渐变光晕、tooltip
- **热度**：基于真实影院定价模型（中心距离加权），颜色由冷蓝→暖琥珀→热红渐变

### 3.2 智能推荐算法

- 硬约束过滤 → 连续座位搜索 → 多维评分排序
- 支持 6 种观影类型：个人/情侣/朋友/亲子/家庭/团体
- 级联表单：人数→年龄段(单选/多选)→类型(动态关联)→姓名

### 3.3 数据流架构

```
SeatData (单一数据源)
    ├── Cinema (渲染)
    ├── RecommendEngine (推荐)
    ├── ScoreEngine (评分)
    └── OrderManager (订单)

Canvas → CustomEvent('selectionChange') → app.js → updateUI()
```

---

## 四、功能完成度

| 分类 | 得分 | 完成项 |
|------|------|--------|
| 基本功能（30分） | ~30/30 | 登录注册、Canvas座位图、三放映厅、弧形布局 |
| 模块功能（60分） | ~60/60 | 推荐/手动选座/拖拽、热度地图(含周切换)、四维评分(含手动)、无障碍(含色盲)、订单中心 |
| 视觉设计（5分） | ~3/5 | 科技感美学、Canvas白底+页面深色双轨配色 |
| 说明文档（5分） | ~5/5 | 设计文档、流程图、AI开发说明书、本报告 |
| 加分项（10分） | ~2/10 | 拖拽选座 |
| **合计（110分）** | **~100/110** | |

---

## 五、AI 协同开发说明

本项目使用 Anthropic Claude Code 进行 AI 辅助开发。AI 参与代码编写、调试、文档生成。关键 AI 生成模块包括 Cinema.js（Canvas引擎）、RecommendEngine.js（推荐算法）、ScoreEngine.js（评分引擎）。开发采用"需求驱动 + 迭代修正"模式，人工负责需求分析、设计决策、测试验证、Bug 发现。

详细说明见 `doc/AI_DEVELOPMENT.md`。

---

## 六、参考资料

1. [MDN Canvas API](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API)
2. [MDN Web Speech API](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Speech_API)
3. [WCAG 2.1](https://www.w3.org/TR/WCAG21/)
4. [ColorBrewer](https://colorbrewer2.org/)
5. [GitHub Dark Theme](https://primer.style/)
6. 万达电影 / 猫眼电影 选座系统 UI 参考
7. 清华大学《Web前端技术实训》课程讲义

---

*本报告由 SmartCinema 团队与 AI 协作生成。*
