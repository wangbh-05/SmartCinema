# SmartCinema 长程重构路线图

> 状态：执行中
> 建立日期：2026-07-18
> 基线提交：`dd9bc02`
> 工作分支：`zcjx/smart_cinema`（不得直接在 `main` 上实施）
> 技术约束：原生 JavaScript、ES Modules、无运行时依赖
> 事实基线：见 `doc/REFACTOR_BASELINE.md`

## 1. 长期目标

将 SmartCinema 分阶段升级为高质量、可维护的原生 JavaScript 应用：

- 建立可靠的领域模型与状态边界；
- 修复库存、订单权限、重复提交、实时状态、键盘、弹窗和响应式问题；
- 重构代码分层、持久化和测试体系；
- 依据 Emil Kowalski 的设计工程原则，完成一致、克制、响应迅速的视觉与交互系统；
- 支持键盘、触控、色盲模式与 `prefers-reduced-motion`；
- 补齐架构、测试、交互、迁移和验收文档。

完成标准不是“已有测试通过”，而是本文件列出的每个阶段门槛均有当前代码、测试结果或浏览器验证作为证据。

## 2. 执行原则

1. **正确性先于美术**：先让库存、订单、身份和状态可信，再做视觉升级。
2. **测试先于结构迁移**：已知 Bug 先具备稳定复现与回归保护。
3. **结构与视觉分离**：架构重构阶段原则上不做视觉改版，降低回归定位成本。
4. **每个阶段保持可运行**：任何阶段结束时，应用必须能启动，相关测试必须可执行。
5. **数据迁移可恢复**：LocalStorage 结构升级必须带版本号、迁移逻辑与异常回退。
6. **不保留双重事实源**：座位、订单、用户和远端占座各自只有一个可信状态来源。
7. **交互细节属于功能**：焦点、Escape、回车、拖拽越界、重复点击和移动端溢出不是最后的装饰工作。
8. **文档跟随代码更新**：阶段状态、决策和验证结果在同一变更中写回本文件。

## 3. 总体顺序与状态

| 阶段 | 状态 | 目标 | 主要证据 |
| --- | --- | --- | --- |
| 0. 基线冻结 | **已完成** | 固化当前行为、测试、问题与布局证据 | 基线文档、测试输出、浏览器验证 |
| 1. 回归保护 | **已完成** | 为已知问题建立自动化或稳定的集成复现 | 新测试、测试矩阵 |
| 2. 架构设计 | **已完成** | 明确领域模型、依赖方向和存储 v2 | 架构 RFC、数据契约 |
| 3. 结构重构 | **进行中** | 按分层目标迁移代码且保持行为可验证 | 模块边界、测试结果 |
| 4. 永久修复 | **进行中（12/13）** | 在新架构内关闭状态、订单与安全渲染类 Bug | 回归测试全绿 |
| 5. 交互基础重构 | **部分完成** | 统一 Modal、Toast、表单、Canvas 和焦点行为 | 键盘/指针测试 |
| 6. 视觉与动效重构 | 待开始 | 建立设计系统、响应式布局和克制动效 | Before/After 审查、视觉验收 |
| 7. 全矩阵验收 | 待开始 | 覆盖桌面、移动、触控、键盘和辅助模式 | QA 报告 |
| 8. 收尾审计 | 待开始 | 清理遗留代码并补齐所有文档 | 完成审计清单 |

## 4. 阶段 0：基线冻结

### 工作项

- [x] 确认当前分支、提交和工作树状态；
- [x] 运行当前自动化测试并记录真实结果；
- [x] 复核已发现 Bug 对应的当前源码路径；
- [x] 固化桌面与窄屏浏览器布局证据；
- [x] 完成 `doc/REFACTOR_BASELINE.md`；
- [x] 标记现有文档中的过期或相互矛盾结论。

### 退出门槛

- 当前功能、测试覆盖范围和未覆盖范围均有记录；
- 每个已知 Bug 有编号、优先级、复现方式、目标测试层和计划修复阶段；
- 后续人员无需依赖聊天上下文即可恢复当前状态。

## 5. 阶段 1：回归保护

### 工作项

- [x] 为放映日期库存隔离建立 Storage/Order 回归测试；
- [x] 为订单用户隔离与未登录操作建立权限测试；
- [x] 为支付重复点击建立幂等测试；
- [x] 为本地选择与远端占座隔离建立状态测试；
- [x] 为文本输入中的撤销快捷键建立 DOM 集成测试；
- [x] 为登录回车、Escape、遮罩拖拽建立 Modal 交互测试；
- [x] 为 320、390、768、800、900、1024、1440px 建立响应式检查；
- [x] 将新增测试接入 `tests/runner.js` 或明确的浏览器测试入口。

### 退出门槛

- 已知问题均能在修复前稳定失败；
- 测试不依赖随机座位分布、真实时间或共享浏览器数据；
- 当前正确行为继续由原有测试保护。

## 6. 阶段 2：目标架构与数据契约

### 目标目录

```text
src/
├── domain/
│   ├── cinema/            # Hall、Showtime、Seat、SeatInventory
│   ├── order/             # Order、OrderStatus、订单约束
│   └── user/              # User、身份与权限约束
├── application/
│   ├── selection/         # 选座用例与本地选择状态
│   ├── booking/           # 创建、确认、取消、退票用例
│   ├── recommendation/    # 推荐服务
│   └── scoring/           # 评分服务
├── infrastructure/
│   ├── storage/           # Repository、schema version、migration
│   └── realtime/          # 远端占座事件适配
├── ui/
│   ├── components/        # Modal、Toast、表单、订单列表
│   ├── controllers/       # DOM 事件到应用用例
│   ├── canvas/            # 座位与热度渲染
│   └── views/             # 页面组合与渲染
└── shared/                # 事件、校验、格式化、常量
```

### 必须形成的领域边界

- `showtimeId`：至少包含影厅与日期，作为库存和订单的共同键；
- `userId`：订单必须归属稳定用户标识，姓名和邮箱不能充当权限依据；
- `SeatInventory`：持久化已售状态，不与 UI 的临时选中状态混合；
- `LocalSelection`：仅表示当前用户准备购买的座位；
- `RemoteHold`：表示其他用户临时占座，不进入当前购物车；
- `Order`：包含 `showtimeId`、`userId`、座位、金额、状态和幂等标识；
- `StorageSchemaVersion`：负责从当前 LocalStorage 结构迁移到 v2。

### 退出门槛

- 形成依赖方向、领域契约与 Storage v2 文档；
- 文档明确 UI 不直接读写 LocalStorage，并给出可执行边界检查；
- 文档明确领域层不依赖 DOM、Canvas 或浏览器事件；
- 所有目标持久化对象都有明确版本、校验入口、迁移与失败恢复协议；
- 代码层落实以上约束属于阶段 3 退出门槛，不以设计文档代替实施证据。

## 7. 阶段 3：结构重构

### 迁移顺序

1. 提取领域值对象和标识符；
2. 建立 Repository 接口及当前 LocalStorage 适配器；
3. 迁移推荐和评分纯逻辑；
4. 迁移选座与订单用例；
5. 建立应用级状态协调器；
6. 将 `src/app.js` 缩减为启动与页面装配；
7. 将 Canvas 输入、布局和绘制职责拆分；
8. 删除确认无引用的旧接口与重复样式入口。

### 退出门槛

- 架构迁移不以视觉改版掩盖行为变化；
- 新模块依赖方向符合阶段 2 契约；
- 原有正确测试与阶段 1 回归测试均可运行；
- `src/app.js` 不再集中承担业务、存储、认证和 DOM 渲染职责。

## 8. 阶段 4：永久修复

### P1 正确性问题

- [x] `BUG-001` 已售座位缺少日期/场次维度；
- [x] `BUG-002` 历史订单缺少登录校验与用户隔离；
- [x] `BUG-003` 确认支付可重复提交；
- [x] `BUG-004` 实时模拟将远端占座加入当前选择；
- [x] `BUG-005` `Ctrl+Z` 在文本输入时清空座位；
- [ ] `BUG-006` 900px 以下网格产生隐式第二列与横向溢出；
- [x] `BUG-013` 用户可控账户字段通过 `innerHTML` 进入账户与管理员视图。

### P2 交互问题

- [x] `BUG-007` 登录/注册表单无法使用 Enter 提交；
- [x] `BUG-008` 从弹窗内容拖动到遮罩释放会意外关闭；
- [x] `BUG-009` 弹窗缺少清晰的右上角关闭键与 Escape 行为；
- [x] `BUG-010` 语音和实时设置持久化/恢复不完整；
- [x] `BUG-011` 综合评分在座位变化后可能保留旧结果；
- [x] `BUG-012` 快捷键帮助与实际实现不一致。

### 退出门槛

- 所有 Bug 都有对应回归证据；
- 库存、订单、用户和临时占座不再互相串线；
- 重复操作、刷新、跨页和旧数据迁移行为均经过验证。

## 9. 阶段 5：交互基础重构

### Modal

- 明确 `role="dialog"`、`aria-modal`、标题关联和初始焦点；
- 提供右上角关闭按钮；
- 支持 Escape，并在关闭后把焦点还给触发元素；
- 仅在指针按下与释放都位于遮罩时关闭；
- 注册表单存在未提交内容时避免意外丢失；
- 小高度视口内可滚动，关闭操作始终可见。

### Canvas 与指针

- 使用统一 Pointer Events，减少 mouse/touch 双实现；
- 拖拽开始后使用 pointer capture；
- 忽略额外触点，处理取消事件和越界释放；
- 键盘焦点、方向键、Enter 和 Space 行为与视觉状态一致。

### 表单与快捷键

- 表单使用原生 `submit` 语义；
- 全局快捷键排除 `input`、`textarea`、`select` 和 `contenteditable`；
- 错误信息可被屏幕阅读器感知；
- 处理中按钮有禁用和状态反馈。

## 10. 阶段 6：视觉与动效重构

### 设计工程约束

- 高频操作和键盘操作不添加动画；
- 动画必须服务于反馈、空间一致性或状态解释；
- UI 动画原则上低于 300ms；
- 进入/退出优先使用有力的 `ease-out`，移动使用 `ease-in-out`；
- 仅动画 `transform` 和 `opacity`，避免布局抖动；
- 动态 UI 优先使用可中断的 transition，而不是会重启的 keyframes；
- 按钮按下反馈使用约 `scale(0.97)`、100–160ms；
- Hover 动效限定在 `@media (hover: hover) and (pointer: fine)`；
- `prefers-reduced-motion` 保留必要的透明度/颜色反馈，移除位移动效；
- Modal 保持中心 transform origin，Popover 从触发点展开；
- 每轮 UI 审查使用 `Before / After / Why` 表格记录决策。

### 视觉系统产物

- 颜色、排版、间距、圆角、阴影、层级和 Motion tokens；
- Button、Input、Select、Checkbox、Card、Modal、Toast、Badge 等组件状态；
- Mobile-first 页面网格和 Canvas 容器策略；
- 空、加载、错误、处理中、成功和禁用状态；
- 色盲模式和高对比度下的 Canvas/DOM 一致配色。

## 11. 阶段 7：验收矩阵

| 维度 | 最低覆盖 |
| --- | --- |
| 视口 | 320、390、768、800、900、1024、1440px |
| 输入 | 鼠标、触控、键盘、拖拽越界、多次快速点击 |
| 用户 | 未登录、普通会员、管理员、不同用户切换 |
| 数据 | 新用户、旧 schema、损坏数据、刷新、跨页面、跨日期 |
| 辅助模式 | 键盘、屏幕阅读器语义、色盲、高对比度、reduced-motion |
| 核心流程 | 登录/注册、推荐、手动选座、评分、支付、历史订单、退票 |

### 退出门槛

- 不存在横向页面溢出；
- 所有核心流程均有成功、取消、失败和重复操作验证；
- 浏览器控制台无未解释错误；
- 自动化测试全绿，人工验收项有记录；
- 视觉对比与交互检查完成。

## 12. 阶段 8：收尾审计

- [ ] 删除死代码、重复样式和过时文档；
- [ ] 更新 README 的真实架构、命令、功能与限制；
- [ ] 更新 TESTING 的自动化和浏览器验证方式；
- [x] 补充 LocalStorage schema、迁移和 v2 导入/导出恢复说明；
- [ ] 补充无障碍、触控和 reduced-motion 说明；
- [ ] 完成目标逐条证据审计；
- [ ] 仅在全部目标被当前证据证明后标记长期 Goal 完成。

## 13. 上下文恢复协议

任何新会话、上下文压缩或任务交接后，按以下顺序恢复：

1. 阅读根目录 `AGENTS.md`；
2. 阅读本文件 `doc/REFACTOR_ROADMAP.md`；
3. 阅读 `doc/REFACTOR_BASELINE.md`；
4. 运行 `git branch --show-current`，确认位于 `zcjx/smart_cinema`；若不是，停止写入；
5. 运行 `git status --short`，不得覆盖未知用户改动；
6. 运行 `npm test`，确认当前事实而不是沿用旧报告；
7. 查看本文件“总体顺序与状态”和“进度日志”；
8. 将当前阶段标记为进行中，只推进该阶段允许的工作；
9. 阶段结束时更新状态、证据、决策和下一步。

## 14. 决策记录

| 日期 | 决策 | 原因 |
| --- | --- | --- |
| 2026-07-18 | Bug 工作拆成“测试/止血”和“永久修复”两部分 | 避免在旧结构上完成会被重写的修复，同时防止把 Bug 搬入新架构 |
| 2026-07-18 | 架构重构先于视觉改版 | DOM、组件和状态边界稳定后再做 Style，降低返工率 |
| 2026-07-18 | 交互正确性不归入最后的美术润色 | 焦点、键盘、拖拽和误关闭属于基础功能质量 |
| 2026-07-18 | 保持原生 JavaScript 和无运行时依赖 | 延续项目技术约束，优先提升结构而非更换框架 |
| 2026-07-18 | 采用 Emil 设计工程原则约束动效 | 强调好默认值、克制动效、可中断性、性能和不可见细节 |
| 2026-07-18 | 全部实施工作固定在 `zcjx/smart_cinema` | 隔离长程改动，避免影响 `main` |
| 2026-07-18 | Storage v2 使用单一 state envelope | 让订单与库存能在一次写入内共同提交，并避免重复事实源 |
| 2026-07-18 | 无法可靠推断 owner/showtime 的 v1 数据进入 quarantine | 不把旧订单猜测归给当前用户，也不把无日期库存污染一周 |
| 2026-07-18 | v2 用 CheckoutIntent 表达支付前状态，订单成功后直接 confirmed | 当前本地支付同步完成，无需持久化瞬时 pending 状态 |

## 15. 进度日志

### 2026-07-18

- 建立长期 Goal 与九阶段计划；
- 从 `main` 的 `dd9bc02` 创建并切换到 `zcjx/smart_cinema`，后续工作不得直接写入 `main`；
- 使用当前 Node 运行测试，结果为 25/25 通过；
- 发现 `doc/FUNCTION_AUDIT.md` 等旧文档与当前测试和实现存在明显漂移；
- 完成 `doc/REFACTOR_BASELINE.md`，记录功能、结构热点、存储契约、测试边界和 12 个 Bug；
- 固化 1440px、800px 与登录弹窗浏览器证据；800px 下 `scrollWidth = 1144`、`clientWidth = 794`，Escape 无法关闭登录弹窗；
- 阶段 0 已完成；下一阶段是阶段 1“回归保护”，尚未开始修改产品行为。

### 2026-07-18 · 阶段 1

- 新增 `tests/test-regressions.js`，以确定性 Node XFAIL 固定 BUG-002、BUG-004；
- 新增 `tests/browser-regressions.html` 与 `tests/browser-regressions.js`，通过真实生产入口固定其余 10 个 Bug；
- 浏览器测试使用 `127.0.0.1` 隔离 origin，不清理 `localhost` 的用户数据；
- Node 实测：原有 25/25 通过，XFAIL 2，非预期失败 0；
- 浏览器实测：XFAIL 10，XPASS 0，ERROR 0；
- 响应式矩阵确认 320、390、768、800、900、1024px 均存在横向溢出，1440px 通过；
- 完成 `doc/REFACTOR_TEST_MATRIX.md`；阶段 1 退出门槛已满足；
- 下一阶段为阶段 2“目标架构与数据契约”，产品行为仍未修改。

### 2026-07-18 · 阶段 2

- 完成 `doc/REFACTOR_ARCHITECTURE.md`，冻结 UI → Application → Domain 依赖方向、端口、状态所有权和十个迁移切片；
- 完成 `doc/DOMAIN_CONTRACTS.md`，冻结 ShowtimeId、SeatKey、Inventory、LocalSelection、RemoteHold、User、Order、CheckoutIntent、Settings、AppState 与错误码；
- 完成 `doc/STORAGE_SCHEMA_V2.md`，冻结单 envelope schema、revision 写入协议、v1 备份、校验、quarantine、恢复与导入导出规则；
- 明确订单与库存由 ConfirmCheckout/CancelOrder 在同一 repository update 中提交；
- 明确 v1 无法确定日期或用户的数据不做隐式猜测；
- 阶段 2 退出门槛已满足；下一阶段为阶段 3“结构重构”，开始落实代码边界。

### 2026-07-18 · 阶段 3 · 切片 1

- 新增 `src/shared/Result.js` 与 `ValidationError.js`；
- 新增纯领域 Hall、ShowtimeId、SeatKey、SeatInventory、LocalSelection、RemoteHold；
- 新增纯领域 Order、OrderStatus、BookingPolicy、User、UserRole；
- 新增 `tests/test-domain-contracts.js`，14/14 通过；全局普通测试从 25 增至 39，XFAIL 仍为 2；
- 边界扫描确认 `src/domain`、`src/shared` 不访问 DOM、Storage、当前时间或随机数；
- 该切片尚未接管旧 UI；下一切片实现 v2 validator、StateRepository 与 v1 migration。

### 2026-07-18 · 阶段 3 · 切片 2

- 新增 Settings 与 CheckoutIntent 领域对象，结算意图支持 consumed 状态和同一 orderId 的幂等消费；
- 新增 `StorageValidator.js`，验证 schema、用户、会话、订单、库存、设置、总价、idempotencyKey 与引用完整性；
- 新增 revision-aware `LocalStateRepository`，candidate 完整校验后单次写入，冲突和写失败均返回稳定错误码；
- 新增 `SessionCheckoutIntentRepository`，损坏 intent 会被清除且不创建订单；
- 新增 `MigrateV1ToV2.js`，先备份 v1，再迁移可靠数据，并将无 owner/showtime 的订单与无日期 sold seats 放入 quarantine；
- 新增 Storage v2 9 项、migration 6 项测试；全局普通测试增至 54/54，XFAIL 仍为 2；
- 下一切片实现 Auth、Selection、Booking、Settings 应用用例和内存 AppState。

### 2026-07-18 · 阶段 3 · 切片 3

- 新增 Register/Login/Logout，用例统一通过 StateRepository 写 session，认证失败不泄露用户名是否存在；
- 新增 StartCheckout/ConfirmCheckout/CancelOrder/ListOrders，覆盖用户隔离、幂等键、订单与库存同 envelope 提交和权限检查；
- 新增 AppState、ChangeShowtime、ToggleSeat、ApplyRemoteHold，远端 hold 与本地 selection 保持分离；
- 新增 UpdateSettings，设置按当前 userId 或 guest 持久化；
- 新增 BrowserClock/BrowserIdGenerator，仅基础设施层访问当前时间、crypto 和随机数；
- 新增 9 项 Application v2 测试；全局普通测试增至 63/63，XFAIL 仍为 2；
- 下一切片建立 bootstrap/legacy adapter，让生产页面逐步改用 v2 用例。

### 2026-07-18 · 阶段 3 · 切片 4

- 新增统一 `AppController`，集中暴露认证、结算、订单、设置、场次、选座与远端占座用例，并负责持久状态写入后的内存状态同步；
- 新增 `src/bootstrap.js` 组合根，浏览器 Storage、Clock 和 IdGenerator 只在基础设施装配处注入；
- 新增 3 项 AppController 测试，覆盖空白启动、认证/设置同步、订单/库存同步与重复确认幂等；
- 全局普通测试增至 66/66，XFAIL 仍为 2；边界扫描确认 `src/domain` 与 `src/application` 不访问 DOM、Storage、系统时间或随机源；
- 该切片尚未替换生产页面的旧管理器；下一切片建立兼容适配层并让首页先从 v2 读取场次、会话、设置与选座状态。

### 2026-07-18 · 阶段 3 · 切片 5

- 新增权限受控的 ListUsers 用例，以及只投影旧视图字段、不持有第二份状态的 LegacyAuthFacade/LegacyOrderFacade；
- 首页生产入口已由 bootstrap 创建唯一 AppController，认证、会话、用户订单、设置、当前场次、选座和已售库存均改从 v2 读写；
- 首页提交订单改为创建带 `showtimeId`、`userId` 与 idempotencyKey 的 CheckoutIntent，不再写 `smartcinema_order_summary`；
- 订单页改为读取 CheckoutIntent 并调用 ConfirmCheckout，提交时立即锁定按钮，订单和库存由同一次 repository update 提交；
- 周一 `dayIndex=0` 不再因 `|| 3` 被错误回退到周四；退票刷新同时校验影厅和日期；
- 新增 4 项 facade 测试；全局普通测试为 70/70，旧实现上的 BUG-002、BUG-004 契约仍保持 XFAIL，等待阶段 4 改写为面向生产入口的常规回归测试；
- 真实浏览器完成“注册 → 推荐选座 → CheckoutIntent → 确认 → 返回首页 → 查看订单”流程：周四已售从 60 增至 62，周五仍为 60，切回周四恢复 62；语音设置跨页保持；
- 当前仅旧版数据导入/导出仍通过 `Storage`，RealtimeSimulator 与 Canvas 仍直接修改 SeatData；下一切片迁移导入/导出、推荐/评分协调和实时适配，再缩减 `src/app.js`。

### 2026-07-18 · 阶段 3 · 切片 6

- 新增无 SeatData/Canvas 依赖的 `RealtimeEventSimulator`，只产生带 canonical `showtimeId` 的 hold、release 与 purchase 事件；随机数、Clock、IdGenerator 和 scheduler 均可注入；
- 新增 ApplyRemotePurchase 用例，远端购买通过 StateRepository 写入对应场次库存，重复事件幂等；
- AppController 按场次接收 RemoteHold，非当前场次事件不污染当前内存状态；远端 purchase 后统一同步库存与本地 selection；
- 生产页改用新事件模拟器，Canvas 中 remote-held 只是 AppState 的视图投影，不能点击、拖选或键盘选中，也不会写入 `selectedSeats`；
- 新增 3 项 Realtime v2 测试，并将 BUG-002/004 从旧实现 XFAIL 转为面向 AppController 的普通回归测试；全局测试为 75/75；
- 删除生产与测试均不再引用的旧 `src/modules/RealtimeSimulator.js`，避免用死代码制造“缺陷仍存在”的假象；
- 真实浏览器启用 realtime 10.5 秒后收到“观众D 正在查看 8排15座”，已选数量始终为 0；关闭开关会释放活跃 hold；
- 浏览器回归矩阵已将 BUG-001/003/010 转为 PASS，实测 PASS 3、XFAIL 7、XPASS 0、ERROR 0；
- 下一切片迁移推荐/评分状态协调与 v2 导入导出，然后拆分 `src/app.js` 的页面控制职责。

### 2026-07-18 · 阶段 3 · 切片 7

- 从 `src/app.js` 提取通用 DialogController 和 AuthDialogController；认证视图通过 facade 调用 AppController，不持有认证状态；
- 登录/注册改用原生 form submit，Enter 可提交；右上角提供带 aria-label 的关闭键；支持 Escape、焦点陷阱与关闭后焦点归还；
- backdrop 关闭改为 pointerdown/pointerup 必须都发生在遮罩，内容区开始后拖到窗口外/遮罩释放不再误关闭；小高度视口内 Dialog 可滚动；
- 移除会劫持文本编辑的全局 Ctrl+Z；补齐 Ctrl/Cmd+E、Ctrl/Cmd+I 实际处理器并排除可编辑元素；
- 任一座位变化都会立即隐藏并清空旧综合评分，内存 AppState 与 DOM 派生结果同步失效；
- 浏览器回归矩阵实测 PASS 9、XFAIL 1、XPASS 0、ERROR 0；当前只剩 BUG-006 响应式横向溢出；
- 下一切片继续拆分设置、订单视图和推荐/评分协调，并把旧数据导入/导出迁移到 v2。

### 2026-07-18 · 阶段 3 · 切片 8

- 新增 StateBackupService，将导入/导出从旧 `Storage` 迁移到唯一 v2 StateRepository；生产 UI 不再直接访问 LocalStorage/SessionStorage；
- 默认安全备份剔除所有 credential，并只能从相同 userId + username 的当前安装恢复；显式完整备份可迁移 demo 明文凭据，UI 会先明确风险；两种模式均清除 session；
- v2 导入先解析顶层版本并完整校验 candidate，再写 `smartcinema_import_backup_v2` 回滚快照，最后以当前 revision + 1 的替换语义提交；任一前置失败都不覆盖现状；
- 导入成功后 AppController 重建内存 AppState，清除登录、CheckoutIntent、本地选座、远端 hold、推荐和评分等暂态；
- LocalStateRepository 新增受 revision 保护的 replace 操作；Storage v2 文档补齐 credentialPolicy、回滚 key 和恢复限制；
- 新增 7 项 StateBackup 测试和 1 项 AppController 暂态清理测试；Node 全局实测 83/83 通过；
- 边界扫描确认 `src/app.js`、`order.html`、`src/ui` 与 `src/application` 不再引用旧 Storage 或直接访问浏览器存储；
- 浏览器回归矩阵再次实测 PASS 9、XFAIL 1、XPASS 0、ERROR 0；唯一剩余已知缺陷仍是 BUG-006；
- 下一切片提取设置、订单与通知页面控制器，再迁移推荐/评分协调，之后拆分 Canvas 输入、布局和绘制职责。

### 2026-07-18 · 阶段 3 · 切片 9

- 新增 SettingsController，集中绑定设置控件并协调 AppController、无障碍语音、Canvas 色盲投影和 realtime 生命周期；持久化失败时恢复当前可信设置，不应用失败请求的副作用；
- 新增 OrdersPanelController，负责订单摘要、历史列表、安全 DOM 渲染、收据与退票交互；订单事实仍只来自 LegacyOrderFacade/AppController，退票后通过回调请求主页面刷新当前场次；
- 新增 ToastController，将通知文本、`role="status"`/`aria-live` 语义、可替换计时器和显示状态从 `src/app.js` 提取；样式移出运行时内联字符串；
- 历史订单视图改用 `hidden` 和 DOM `textContent` 构造，不再拼接订单字段到 `innerHTML`；设置、导入/导出和订单列表事件由各自控制器绑定；
- 新增 6 项 UI Controller 测试，覆盖设置加载、写失败回滚、Toast 计时、结算摘要、安全文本渲染和退票回调；Node 全局实测 89/89 通过；
- `src/app.js` 从 1204 行降至 1062 行；浏览器矩阵仍为 PASS 9、XFAIL 1、XPASS 0、ERROR 0；真实页面验证历史订单空态与注册成功通知；
- 下一切片把推荐、系统评分和用户评分协调迁入 application/UI 边界，并删除页面入口中的派生状态与大段模板拼接。

### 2026-07-18 · 阶段 3 · 切片 10

- 新增只读 SeatLayoutSnapshot，统一推荐与评分需要的座位、价格、选中、已售和 remote-held 输入；UI adapter 负责从旧 SeatData 生成快照，application 不反向依赖 UI/Core；
- 新增纯 RecommendSeats 用例，保留少年/老年硬约束与情侣、家庭、团体连续座位策略，并返回 canonical SeatKey；旧 RecommendEngine 缩减为兼容适配器；
- 新增纯 ScoreSelection/CombineScores 用例，系统评分和用户评分逐项校验并输出冻结的结构化结果；旧 ScoreEngine 缩减为兼容适配器；
- AppController 新增 recommendation、systemScore、manualScore、combinedScore 命令与 AppState 更新；选择变化和库存 revision 变化按契约失效派生结果；
- 相同 seatKeys 的 replaceSelection 改为幂等：真实流程发现重复同步会清掉刚计算的 systemScore，修复后相同命令保持当前 AppState 与综合评分；
- 新增 RecommendationController 与 ScoringController，表单、推荐结果、评分详情和综合评分改用安全 DOM 节点渲染；页面入口不再拼接这些模板，也移除非必要的 400ms 数字滚动动画；
- 新增 7 项派生状态测试和 2 项 UI 控制器测试；Node 全局实测 98/98 通过；application/domain 边界扫描无 DOM、浏览器存储或 UI 反向依赖；
- `src/app.js` 从 1062 行降至 858 行；真实浏览器完成“注册 → 推荐 → 应用 → 系统评分 → 用户综合评分”，最终显示系统 95、用户 50、综合 77；
- 浏览器矩阵再次实测 PASS 9、XFAIL 1、XPASS 0、ERROR 0；下一切片拆分 Canvas 输入、布局与绘制职责。

### 2026-07-18 · 阶段 3 · 切片 11

- 新增纯 CinemaLayout，按 rows/cols 和可用容器尺寸计算弧形座位位置，并提供与 DOM/Canvas 无关的命中测试；Canvas display width 开始服从父容器与视口的较小值；
- 新增 CinemaInputController，以统一 Pointer Events 取代 mouse/touch 双实现；主指针按下后使用 pointer capture，越界释放仍能完成或取消当前手势；
- 输入状态机显式处理 click、矩形拖选、pointercancel、pointerleave、额外触点、方向键、Enter/Space，并统一复用已售与 remote-held 不可选规则；
- Cinema 暂时保留绘制职责，但布局与输入已通过组合委托；`#cinema-canvas` 增加 `touch-action: none`，避免触控拖选与页面手势竞争；
- 新增 5 项 CanvasInteraction 测试；Node 全局实测 103/103 通过；浏览器矩阵保持 PASS 9、XFAIL 1、XPASS 0、ERROR 0；
- BUG-006 在 768/800/900px 的溢出宽度有所下降但尚未关闭，仍等待完整响应式网格修复；
- 下一切片把颜色、热度、动画和所有 draw 方法迁入独立 CinemaRenderer，让 Cinema 只保留组合与兼容接口。

### 2026-07-18 · 阶段 3 · 切片 12

- 新增 CinemaRenderer，集中持有 Canvas 调色板、色盲配色、热度派生、座位弹性动画和全部绘制方法；渲染器只通过注入的 SeatData、layout 与 interaction state 读取当前视图；
- Cinema 从 375 行收敛为 84 行，只负责组装 layout/input/renderer、设置高 DPI 画布、派发 `selectionChange` 以及保留 `redraw/resize/colorblind` 页面接口；
- 热度计算在迁移中补齐单行或单列影厅的零距离保护；旧实现中重复的色盲热度赋值随职责迁移消失；
- Node 全局实测保持 103/103 通过；真实浏览器矩阵保持 PASS 9、XFAIL 1、XPASS 0、ERROR 0；Canvas 键盘实测通过 ArrowRight + Space 将已选数量从 0 更新为 1；
- Canvas 布局、输入与绘制职责完成分离，且页面调用方不依赖其内部字段；下一切片审计 `src/app.js` 的剩余职责、旧兼容模块和无引用代码，按阶段 3 退出门槛决定最后的结构收尾范围。

### 2026-07-18 · 阶段 3 · 切片 13

- 退出审计确认账户状态、管理员后台、聊天窗口和文件备份仍在页面入口直接绑定与渲染；新增 AccountController、AdminPanelController、ChatbotController 与 BackupController 分别接管这些职责；
- 账户名、管理员用户表格和聊天消息全部改用 `textContent`/DOM 节点构造；新增 `BUG-013`，覆盖注册姓名从生产入口进入账户视图时不得被解释为 HTML；
- 管理员后台改为复用 DialogController，避免每次打开累积 backdrop 监听器，并统一获得语义关闭键、Escape、焦点陷阱与焦点归还；聊天建议从带点击监听的 `span` 改为原生 button，并补充展开与关闭语义；
- `src/app.js` 从 858 行降至 686 行；新增 3 项控制器测试，Node 全局实测 106/106 通过；浏览器矩阵扩展为 PASS 10、XFAIL 1、XPASS 0、ERROR 0；另实测管理员 Dialog 的打开、关闭标签与 Escape；
- 阶段 4 状态更新为 12/13，只剩 BUG-006；下一切片审计 AccessibilityManager 的动态帮助弹窗、全局按键拦截和生产无引用的 v1 模块，再判断阶段 3 是否可退出。

### 2026-07-18 · 阶段 3 · 切片 14

- 将旧 AccessibilityManager 拆为 BrowserSpeechService 与 AccessibilityController：浏览器语音能力由 infrastructure 封装，UI 控制器负责公告、快捷键和帮助 Dialog；
- 快捷键帮助不再使用动态 `innerHTML` 与内联 `onclick`，改为安全 DOM 和统一 DialogController；移除对 Tab、按钮 Enter/Space 与方向键的全局二次处理，避免覆盖浏览器原生交互和 Canvas 输入状态机；Ctrl/Cmd+K 与 Alt+数字现在排除可编辑控件；
- 删除生产与测试均无引用的旧 AuthManager、Storage；删除只被 v1 自测引用且与原子结算模型冲突的 OrderManager；v1→v2 迁移器继续直接读取旧键，不依赖旧管理器；
- 推荐/评分测试改为直接覆盖 RecommendSeats、ScoreSelection 与 SeatDataLayoutAdapter，随后删除迁移期 RecommendEngine/ScoreEngine 兼容壳；测试摘要使用真实边界命名；
- Node 有效测试为 103/103；浏览器矩阵保持 PASS 10、XFAIL 1、XPASS 0、ERROR 0；真实页面实测 Ctrl+K 帮助具备语义关闭键且 Escape 可关闭；
- 下一切片提取 AppState→SeatData/Canvas 的视图投影和页面场次协调，进一步把 `src/app.js` 收敛为组合根与薄事件编排，再执行阶段 3 退出审计。
