# SmartCinema 完善计划

> **历史归档（2026-07-18）：** 本计划对应旧审计，所列修复已被当前长程路线图取代。不要按本文中的旧文件路径执行；请使用 `REFACTOR_ROADMAP.md`。

> 基于 `doc/FUNCTION_AUDIT.md` 制定。  
> 目标：补齐高风险缺口，修复测试与实现不一致，完成订单闭环，并形成可验收、可提交的项目状态。  
> 执行方式：本计划经确认后再修改源码与文档。

## 一、所需工具链

当前仓库无需新增第三方依赖。建议准备以下本机工具：

- Node.js / npm：运行 `npm start`、`npm test`。
- 浏览器：手动验收主页面、订单页和无障碍交互。
- 终端工具：`rg`、`curl`、`lsof`、`git`，用于检查代码、服务和变更。
- 可选：PDF 导出工具，用于最终把 `doc/REPORT.md` 导出为 `report.pdf`。
- 可选：压缩工具，用于最终生成提交 zip。

如需我执行本地服务或浏览器验证，可能需要授权运行监听端口或访问 `127.0.0.1:8080`。

## 二、阶段 1：需求覆盖与口径统一

### 1.1 明确功能完成口径

目标：避免 `REQUIREMENTS_CHECK.md`、`doc/REPORT.md`、实际代码之间互相矛盾。

计划：

- 以作业要求和 `FUNCTION_AUDIT.md` 为准，重新整理一版最终完成度。
- 将“真实 WebSocket”统一表述为“前端实时模拟 / 模拟 WebSocket 效果”，除非实际接入后端 WebSocket。
- 将热度地图说明统一为“集成在座位图中的热度边框”，并说明 `HeatmapEngine.js` 是旧版独立实现或备用实现。
- 修正文档中“订单已确认、支持退票退款”等过度表述，直到对应 UI 闭环完成。

涉及文件：

- `REQUIREMENTS_CHECK.md`
- `doc/REPORT.md`
- `doc/AI_DEVELOPMENT.md`
- `doc/USER_FLOW.md`
- `README.md`

验收：

- 文档中不再同时出现 `110/110` 和 `100/110` 的冲突结论。
- 每个加分项都能对应到真实实现，且措辞不过度承诺。

### 1.2 修正陈旧注释和说明

目标：源码注释与当前 UI 颜色、交互一致。

计划：

- 修正 `SeatData.js` 中座位状态颜色注释。
- 标注 `HeatmapEngine.js` 当前未接入主应用，或决定接入独立热度图区域。
- 修正键盘帮助中尚未实现的快捷键说明，或后续补齐实现后保留。

涉及文件：

- `src/core/SeatData.js`
- `src/modules/HeatmapEngine.js`
- `src/utils/accessibility.js`

验收：

- 注释不再描述已废弃行为。
- 用户可见帮助文案与实际功能一致。

## 三、阶段 2：Bug 修复与核心功能补齐

### 2.1 修复测试套件 API 脱节

目标：让 `npm test` 能真实验证当前实现。

计划：

- 将测试中的 `new SeatData(5, 10)`、`new SeatData(10, 20)` 改为当前 API：`new SeatData('small')`、`new SeatData('medium')`、`new SeatData('large')`。
- 修复测试 runner 统计汇总，目前测试套件 `runAll()` 没有返回 summary，导致全局结果出现 `undefined/undefined` 和 `NaN`。
- 增加针对当前需求的测试：
  - 三厅座位数：100、200、300。
  - 少年推荐不在前三排。
  - 老年推荐不在后三排。
  - 情侣推荐返回 2 个连续座位。
  - 家庭推荐返回指定人数连续座位。
  - 团体 5 人同排连续。
  - 评分返回 0-100 和三个等级之一。
  - 订单创建、确认、取消状态流。

涉及文件：

- `tests/test-seatdata.js`
- `tests/test-recommend.js`
- `tests/test-score.js`
- `tests/runner.js`
- 可能新增：`tests/test-order.js`

验收：

```bash
npm test
```

期望：

- 所有测试通过。
- 全局摘要显示正确的总数、通过数、失败数和成功率。

### 2.2 修复团体票 5 人边界

目标：与作业要求和文档中的“团体 5-20 人”一致。

计划：

- 将 `RecommendEngine` 中 `groupSize < 6` 改为 `groupSize < 5`。
- 同步错误提示文案为“团体票至少5人，最多20人”。
- 确保 5 人团体推荐必须同排连续。
- 检查表单逻辑：人数为 5 时目前会进入“家庭/朋友”选项，若作业要求 5 人也可团体，需要给 5 人增加“团体”选项，或在文档中明确 6+ 才显示团体。建议增加“团体”选项，满足覆盖更完整。

涉及文件：

- `src/modules/RecommendEngine.js`
- `src/app.js`
- `tests/test-recommend.js`

验收：

```bash
node --input-type=module -e 'import {SeatData} from "./src/core/SeatData.js"; import {RecommendEngine} from "./src/modules/RecommendEngine.js"; const r = new RecommendEngine(new SeatData("medium")).recommend("adult", 5, "group"); console.log(r.success, r.seats?.length);'
npm test
```

期望：

- 输出 `true 5`。
- 测试通过。

### 2.3 完成订单确认、取消和退票闭环

目标：订单中心从“仅能创建”提升为“可确认、可取消、可退票、座位状态可同步”。

计划：

- 确认支付后让订单状态变为 `confirmed`：
  - 方案 A：`createOrder()` 后立即调用 `confirmOrder(order.id)`。
  - 方案 B：新增 `createConfirmedOrder()` 或给 `createOrder()` 支持初始状态参数。
  - 推荐方案 A，改动小且复用现有状态机。
- 统一已售座位持久化：
  - 当前 `order.html` 写入 `smartcinema_order_sold`，主页未读取。
  - 建议新增 Storage 方法：`loadSoldSeats()`、`saveSoldSeats()`、`addSoldSeats()`、`removeSoldSeats()`。
  - 主页初始化和切换厅/日期后应用持久化已售座位。
- 历史订单面板增加操作：
  - 待确认：取消订单。
  - 已确认：退票/取消并退款。
  - 已取消：只读展示。
- 退票时：
  - 调用 `OrderManager.cancelOrder(order.id, reason)`。
  - 从持久化已售座位中移除对应座位。
  - 调用 `SeatData.refundSeats()` 恢复当前厅内座位。
  - 刷新 Canvas、统计和历史订单。
- 添加订单详情/收据展示，可复用 `OrderManager.generateReceipt()`。

涉及文件：

- `order.html`
- `src/app.js`
- `src/modules/OrderManager.js`
- `src/core/SeatData.js`
- `src/utils/storage.js`
- `tests/test-order.js`

验收：

- 登录后选座，提交订单，确认支付。
- 返回首页后，历史订单显示为“已确认”。
- 已购座位在主页显示为已售。
- 点击退票后，订单状态变为“已取消”，座位恢复为空座。
- 刷新页面后，订单状态和座位状态仍保持一致。
- `npm test` 通过。

### 2.4 恢复选座状态或移除无效存储

目标：处理 `saveSeatSelection()` 只保存不恢复的问题。

计划：

- 二选一：
  - 实现启动时恢复未提交选座。
  - 或删除/弱化该功能，避免文档声称已持久化当前选座。
- 推荐实现恢复，但需要防止恢复已售座位。

涉及文件：

- `src/app.js`
- `src/utils/storage.js`

验收：

- 选择座位后刷新页面，可恢复仍为空座的选择。
- 若座位已被订单确认售出，不恢复为已选。

## 四、阶段 3：无障碍与交互补强

### 3.1 修正或补齐键盘选座

目标：用户帮助中写到的键盘功能真实可用。

计划：

- 给 Canvas 设置可聚焦属性，例如 `tabindex="0"`。
- 在 `Cinema` 内维护当前键盘焦点座位。
- 支持方向键移动焦点。
- 支持 Enter/Space 选中或取消当前座位。
- 对 Ctrl+A、Ctrl+D 做选择：
  - 若实现：Ctrl+A 全选可用座位，Ctrl+D 清空选择。
  - 若不实现：从帮助文案中移除。
- 建议至少实现方向键 + Enter/Space，Ctrl+A 可不做以避免误选过多座位。

涉及文件：

- `index.html`
- `src/core/Cinema.js`
- `src/utils/accessibility.js`
- `src/app.js`

验收：

- Tab 可聚焦到 Canvas。
- 方向键可移动座位焦点。
- Enter/Space 可切换选座。
- 屏幕阅读器公告能提示当前座位或选座变化。

### 3.2 热度地图呈现策略确认

目标：降低“热度地图不是独立地图”的扣分风险。

计划：

- 方案 A：保留集成式热度边框，并在文档中明确“热度地图已整合进座位图”。
- 方案 B：接入 `HeatmapEngine.js`，在页面增加一个可展开的独立热度图 Canvas。
- 推荐方案 B：更稳妥地覆盖“影院热度地图”要求，同时保留当前边框热度。

涉及文件：

- `index.html`
- `src/app.js`
- `src/modules/HeatmapEngine.js`
- 样式文件或内联样式

验收：

- 页面可看到独立热度图或明确的热度图区域。
- 切换日期/放映厅后热度图同步更新。
- 红/黄/蓝图例清楚。

## 五、阶段 4：文档、报告和提交物

### 4.1 更新完成度文档

目标：让最终材料与修复后的真实项目状态一致。

计划：

- 修订 `REQUIREMENTS_CHECK.md`，列出已完成、加分项、验证命令。
- 修订 `doc/REPORT.md` 的完成度估算。
- 修订 `doc/USER_FLOW.md` 中订单流程，补上退票/取消分支。
- 修订 `doc/AI_DEVELOPMENT.md` 中实时模拟和订单描述。
- 更新 `TESTING.md`，加入新的验收流程。

涉及文件：

- `REQUIREMENTS_CHECK.md`
- `doc/REPORT.md`
- `doc/USER_FLOW.md`
- `doc/AI_DEVELOPMENT.md`
- `TESTING.md`

验收：

- 文档与源码一致。
- 文档中不再出现占位式或互相矛盾的得分说明。

### 4.2 最终提交材料准备

目标：满足课程提交要求。

计划：

- 由你提供组名、姓名、学号、邮箱后，我填入 `doc/REPORT.md`。
- 将 `doc/REPORT.md` 导出为 `report.pdf`。
- 整理提交包，排除 `.git`、临时文件、无关缓存。
- 生成命名符合要求的 zip，例如 `组名_大作业1.zip`。

所需用户信息：

- 组名。
- 每位组员姓名。
- 每位组员学号。
- 每位组员邮箱。

验收：

- `report.pdf` 存在且内容完整。
- zip 内含项目源码、文档和报告，不含无关缓存。
- 解压后能按 README 启动和运行测试。

## 六、阶段 5：总体验收清单

### 自动化验收

```bash
npm test
```

必须通过：

- SeatData 三厅配置、选座、清空、已售恢复。
- RecommendEngine 年龄约束、情侣/家庭/团体推荐。
- ScoreEngine 百分制评分和等级。
- OrderManager 创建、确认、取消、统计。

### 本地服务验收

```bash
npm start
```

浏览器访问：

```text
http://localhost:8080
```

必须验证：

- 首页正常加载。
- 三个放映厅切换正常。
- 日期切换后座位分布/热度更新。
- 登录、注册、退出正常。
- 管理员账号 `admin/admin123` 可进入后台。

### 功能验收

- 智能推荐：
  - 少年不推荐前三排。
  - 老年人不推荐后三排。
  - 情侣返回连续 2 座。
  - 家庭返回连续 3-5 座。
  - 5-20 人团体返回同排连续座位。
- 手动选座：
  - 点击选中/取消。
  - 拖拽多选。
  - 清空生效。
- 热度地图：
  - 红/黄/蓝图例明确。
  - 一周日期切换生效。
- 评分：
  - 系统评分自动更新。
  - 手动评分提交后显示综合评分。
- 订单：
  - 提交订单跳转确认页。
  - 确认支付后订单为已确认。
  - 返回首页后座位为已售。
  - 取消/退票后订单变取消，座位恢复。
- 无障碍：
  - 大字体/高对比或无障碍模式生效。
  - 色盲模式切换 Canvas 配色。
  - 语音提示可开启。
  - 键盘帮助与实际功能一致。

### 文档验收

- `README.md` 启动说明准确。
- `TESTING.md` 测试步骤与当前 UI 一致。
- `REQUIREMENTS_CHECK.md` 与实际结果一致。
- `doc/REPORT.md` 无个人信息占位符。
- `doc/AI_DEVELOPMENT.md` 准确说明 AI 协作和学生修改。

## 七、执行顺序建议

推荐按以下顺序执行，降低返工：

1. 修复测试 runner 和测试 API。
2. 修复团体票 5 人边界。
3. 完成订单确认、取消、退票和已售持久化。
4. 补齐或修正文档中键盘与热度描述。
5. 视时间决定是否接入独立热度图。
6. 跑完整自动化测试。
7. 浏览器手动验收关键流程。
8. 更新最终文档和提交材料。

## 八、风险与取舍

- 订单闭环是最高风险项，因为涉及跨页状态、LocalStorage、当前厅/日期座位状态同步。
- 独立热度图不是绝对必须，但能降低老师按字面要求检查时的风险。
- 键盘选座若时间不足，至少要修正文案，避免“帮助写了但不能用”。
- 测试必须优先修复，否则后续每次改动都缺少可靠反馈。
- 提交物信息需要用户提供，无法由代码自动补全。
