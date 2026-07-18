# SmartCinema 重构事实基线

> 基线日期：2026-07-18
> 工作分支：`zcjx/smart_cinema`
> 基线提交：`dd9bc029b6df075b95a76c3c56c509f16b7bf679`
> 基线提交说明：`feat: complete SmartCinema audit fixes`
> 长程计划：见 `doc/REFACTOR_ROADMAP.md`

本文只记录能够从当前代码、自动化测试或浏览器复现中证明的事实。后续阶段不得用旧聊天结论替代本文件，也不得把“现有测试通过”理解为交互与跨页面流程已经正确。

## 1. 分支与保护边界

- 长程重构、Bug 修复和视觉改版全部在 `zcjx/smart_cinema` 上进行；
- `main` 仅作为基线来源，不直接承载本轮工作；
- 建立分支时，唯一未提交变更为新增的 `doc/REFACTOR_ROADMAP.md`，该变更已随工作树带入新分支；
- 恢复工作时必须先运行 `git branch --show-current`。若不是 `zcjx/smart_cinema`，停止写入并先恢复正确分支。

## 2. 当前产品与用户流程

### 已实现能力

- 小厅、中厅、大厅切换，以及周一至周日日期切换；
- Canvas 座位图、单击选择、拖拽框选、键盘选座和座位统计；
- 基于人数、年龄和观影类型的智能推荐；
- 系统体验评分、用户手动评分与综合评分；
- LocalStorage 登录、注册、退出与管理员入口；
- 独立订单确认页、支付确认、历史订单、取消与退票；
- 热度图、实时多用户模拟、AI 观影顾问；
- 深色、无障碍、色盲、语音、主题色、数据导入与导出设置。

### 当前核心流程

```text
index.html
  ├─ 登录/注册
  ├─ 切换影厅和日期
  ├─ 推荐或手动选择座位
  ├─ 查看系统/综合评分
  └─ 将订单摘要写入 sessionStorage
          ↓
      order.html
          ├─ 重新构造 SeatData
          ├─ 创建并确认订单
          ├─ 写入 sold_seats
          └─ 返回 index.html
```

这一流程跨越 DOM、内存对象、LocalStorage 和 SessionStorage，目前没有统一应用状态或事务边界。

## 3. 当前代码结构与热点

| 路径 | 行数 | 当前职责与风险 |
| --- | ---: | --- |
| `src/app.js` | 1185 | 启动、DOM 查询、事件、认证 UI、推荐、评分、订单、设置、实时与持久化集中在一个类中 |
| `index.html` | 582 | 页面结构之外还包含大量页面级 CSS 和内联样式 |
| `src/core/Cinema.js` | 420 | Canvas 布局、绘制、鼠标、触控、键盘和动画耦合 |
| `src/core/SeatData.js` | 412 | 座位生成、日期热度、选择与已售状态共存 |
| `order.html` | 325 | 页面结构、样式、状态恢复、订单创建和支付处理内联 |
| `public/styles/components.css` | 733 | 通用组件样式较大，但首页仍保留另一套内联组件规则 |
| `src/modules/RecommendEngine.js` | 321 | 推荐规则与座位数据结构直接绑定 |
| `src/modules/ScoreEngine.js` | 320 | 评分计算与当前 SeatData 实例绑定 |

当前统计范围内共有约 7084 行 HTML、JavaScript、CSS 和测试代码。最主要的结构风险不是总行数，而是相同职责同时分散在 HTML 内联代码、`src/app.js`、功能模块和 Canvas 引擎中。

## 4. 自动化测试基线

执行命令：

```bash
/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/runner.js
```

2026-07-18 实测结果：

| 测试套件 | 通过 | 失败 |
| --- | ---: | ---: |
| SeatData | 9 | 0 |
| RecommendEngine | 8 | 0 |
| ScoreEngine | 4 | 0 |
| OrderManager | 4 | 0 |
| **总计** | **25** | **0** |

### 当前测试能证明的内容

- 三种影厅的座位数量和基本座位读写；
- 选择、清空、确认购买和退票的基础 SeatData 行为；
- 推荐人数、年龄禁排、情侣/家庭/五人团体规则；
- 空选择、已选择和评分详情的纯逻辑；
- 订单创建、确认、取消退款和基础统计。

### 当前测试不能证明的内容

- `src/app.js` 的 DOM 事件与跨模块协调；
- 登录、注册、会话恢复和不同用户权限；
- LocalStorage/SessionStorage 的真实浏览器行为、迁移和损坏数据恢复；
- `index.html → order.html → index.html` 跨页闭环；
- 重复支付、跨日期库存、跨用户订单隔离；
- Canvas 指针、触控、拖拽越界和多触点；
- Modal 的焦点、Enter、Escape、遮罩关闭和表单保护；
- 响应式布局、横向溢出、屏幕阅读器和 reduced-motion。

`tests/runner.js` 当前只导入四个纯 JavaScript 测试套件，没有 DOM 或浏览器测试入口。

## 5. 浏览器布局与交互证据

浏览器验证地址：`http://localhost:8080/`。

### 1440 × 900 桌面视口

- `innerWidth = 1440`；
- `documentElement.clientWidth = 1434`；
- `documentElement.scrollWidth = 1434`；
- 当前首页没有横向溢出；页面内容高度约 1805px。

截图：`/Users/a1/.codex/visualizations/2026/07/17/019f725b-685f-7d91-8dfb-0c4675dbfee7/smartcinema-baseline-desktop.png`

### 800 × 700 窄屏视口

- `innerWidth = 800`，可用 `clientWidth = 794`；
- `scrollWidth = 1144`，相对可用宽度多出 350px；
- `.main-container` 宽 794px；
- 首个 `.side-panel` 位于 `x = 902`，右边界为 1144px；
- `(max-width: 900px)` 已匹配，但 `.side-panel { grid-column: 2; }` 仍创建隐式第二列。

截图：`/Users/a1/.codex/visualizations/2026/07/17/019f725b-685f-7d91-8dfb-0c4675dbfee7/smartcinema-baseline-800.png`

### 登录弹窗

- 弹窗正文底部存在一个全宽“关闭”按钮，但没有常见、清晰的右上角关闭按钮；
- 弹窗打开后，在用户名输入框按 Escape，`#auth-modal` 仍保持 `active = true`、`aria-hidden = false`；
- 登录按钮为 `type="button"`，表单写有 `onsubmit="return false"`，认证逻辑只绑定按钮 `click`，因此 Enter 不触发提交；
- 遮罩使用冒泡后的 `click` 目标判断关闭，没有记录 pointerdown 起点，因此从内容区拖到遮罩释放存在误关闭路径；
- 已在浏览器复现：成员姓名输入框内按 `Ctrl+Z` 时，文本仍保留，但已选座位数从 1 变为 0。

截图：`/Users/a1/.codex/visualizations/2026/07/17/019f725b-685f-7d91-8dfb-0c4675dbfee7/smartcinema-baseline-auth-modal.png`

## 6. 当前持久化契约

| 存储 | Key | 当前形态 | 已知缺口 |
| --- | --- | --- | --- |
| LocalStorage | `smartcinema_users` | 用户数组 | 由 AuthManager 直接读写，无 schema version |
| LocalStorage | `smartcinema_session` | 当前用户会话 | 与通用 Storage 封装分离 |
| LocalStorage | `smartcinema_orders` | 全局订单数组 | 缺少稳定 `userId` 与查询权限边界 |
| LocalStorage | `smartcinema_sold_seats` | `{ [hallType]: seatKey[] }` | 只有影厅维度，没有日期/场次维度 |
| LocalStorage | `smartcinema_seat_selection` | 选择、时间和统计快照 | UI 临时状态与持久化恢复紧耦合 |
| LocalStorage | `smartcinema_settings` | 设置对象 | 语音未在 change 时保存；语音与实时开关未在 load 时恢复 |
| SessionStorage | `smartcinema_order_summary` | 跨页订单摘要 | 没有幂等 token，支付处理不是事务 |

当前没有统一 schema version、迁移器或对象级校验入口；导入数据只做 JSON 解析和字段存在判断。

## 7. 已知 Bug 台账

优先级定义：P1 会破坏正确性、权限、订单或主要流程；P2 会造成明显交互错误、状态误导或设置不一致。

| ID | 优先级 | 当前事实/稳定复现 | 目标测试层 | 计划关闭阶段 |
| --- | --- | --- | --- | --- |
| BUG-001 | P1 | `sold_seats` 仅按 `hallType` 保存；同影厅不同日期共用已售座位 | Storage + booking 集成 | 4 |
| BUG-002 | P1 | 首页历史订单不先校验登录，`getOrders()` 返回全局数组且订单没有稳定 `userId` | auth/order 集成 | 4 |
| BUG-003 | P1 | 支付 click 每次都创建新订单；按钮无 processing/disabled 状态，摘要无幂等 token | order page 集成 | 4 |
| BUG-004 | P1 | RealtimeSimulator 直接设置 `seat.isSelected` 并写入 `selectedSeats`，远端占座进入本地购物车状态 | realtime 状态单测 | 4 |
| BUG-005 | P1 | 全局 `Ctrl+Z` 不排除输入控件；已在姓名输入框复现座位被清空 | DOM 键盘集成 | 4 |
| BUG-006 | P1 | 800px 时 `scrollWidth 1144 > clientWidth 794`，侧栏被放入隐式第二列 | 响应式浏览器测试 | 4/6 |
| BUG-007 | P2 | 认证表单禁用 submit，认证只监听按钮 click，Enter 无效 | Modal DOM 集成 | 4/5 |
| BUG-008 | P2 | 遮罩只在最终 click 时判断 target，没有校验按下与释放都在遮罩 | Pointer/Modal 集成 | 4/5 |
| BUG-009 | P2 | 只有底部全宽关闭按钮；Escape 实测不能关闭，也没有焦点归还 | Modal/a11y 集成 | 4/5 |
| BUG-010 | P2 | `voice-toggle` 只改运行时；loadSettings 不恢复 voice/realtime，开关显示与状态可不一致 | settings 单测 + DOM | 4 |
| BUG-011 | P2 | `updateScore()` 在空选择时隐藏手动面板，但不重置 `combined-score-result` | score/UI 集成 | 4 |
| BUG-012 | P2 | 帮助列出 Ctrl+E/Ctrl+I，但当前键盘绑定只实现 Ctrl/Cmd+K、Alt+数字和 App 的 Ctrl+Z | a11y DOM 集成 | 4/5 |

## 8. 文档漂移

- `doc/FUNCTION_AUDIT.md` 仍记录“14 个测试全部失败”，与当前 25/25 通过矛盾；该文件应保留为历史审计或明确标记过期，不能再作为当前事实；
- `TESTING.md` 声称 SeatData、AuthManager、OrderManager 等具有集成测试，并声称 Canvas/认证/无障碍已通过浏览器验收；当前自动运行器无法证明这些结论；
- `doc/README.md` 描述的是可复制的通用 Frontend Agent Kit，甚至提到 Vue/React/Svelte，而不是 SmartCinema 当前文档索引；
- 根 `README.md` 的模块清单和测试命令基本可用，但后续架构迁移后必须同步更新。

在阶段 8 之前，不删除有历史价值的旧审计；先加过期标识和新事实入口，避免再次混淆。

## 9. 验收证据矩阵

| 领域 | 当前单测 | 当前浏览器证据 | 目标补强 |
| --- | --- | --- | --- |
| 座位纯逻辑 | 有 | 基础页面可运行 | 场次库存、远端占座、本地选择隔离 |
| 推荐 | 有 | 基础表单可见 | DOM 提交、错误和焦点反馈 |
| 评分 | 有 | 基础渲染可见 | 综合评分失效与座位变化联动 |
| 认证 | 无 | Enter/Escape 缺陷已复现 | 登录、注册、切换、焦点、权限全流程 |
| 订单 | 基础单测 | 跨页页面可运行 | 幂等、用户隔离、跨日期、刷新、取消/退票 |
| Canvas | 无 | 鼠标基本流程可用 | 触控、键盘、pointer capture、越界、多触点 |
| 响应式 | 无 | 1440 正常、800 溢出 | 320–1440px 固定矩阵 |
| 设置/无障碍 | 无 | 控件可见 | 持久化、语义、屏幕阅读器、reduced-motion |

## 10. 尚未证明的区域

以下内容在阶段 0 不标记为“通过”：

- Safari、Firefox 和真实移动设备行为；
- 屏幕阅读器的实际播报顺序与名称；
- 320、390、768、900、1024px 的完整布局；
- Pointer Events、多触点、拖拽取消和窗口失焦；
- LocalStorage 损坏、空间不足、旧数据迁移与跨标签页竞争；
- 高频实时事件、300 座大厅和低性能设备下的渲染性能；
- `prefers-reduced-motion`、高对比度和所有主题色组合；
- 真实后端、真实 WebSocket、服务端认证和支付安全；当前项目仍是纯前端模拟应用。

## 11. 阶段 0 结论

当前版本能够启动，四个核心纯逻辑套件 25/25 通过，但这不能覆盖已经复现的交互、状态与跨页问题。阶段 1 应先把 Bug 台账转化为可稳定失败的回归测试；阶段 2 再冻结领域、存储和依赖契约；之后才迁移结构、永久修复并进行视觉重构。
