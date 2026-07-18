# SmartCinema 测试指南

> 当前事实日期：2026-07-18。生产入口使用商业领域 v3；`legacy.html` 的 v2/Canvas 套件仍保留为迁移回归，不代表新产品信息架构。

## 1. 测试入口

```bash
npm install
npm start
npm test
```

真实浏览器商业流程：

```text
http://127.0.0.1:8080/tests/browser-regressions.html
```

测试必须使用 `127.0.0.1`，不能改成日常使用的 `localhost`。浏览器入口会清除当前 origin 下以 `smartcinema_` 开头的数据；独立 hostname 可避免影响个人演示数据。

旧视觉对照仍可打开：

```text
http://127.0.0.1:8080/tests/visual-review.html
http://127.0.0.1:8080/legacy.html
```

## 2. 当前证据

| 层级 | 结果 | 主要覆盖 |
| --- | ---: | --- |
| Node | 142/142 | v2 既有契约 + 商业目录、Money、票种/草稿、座位规则、报价、hold、订单快照、Storage v3、迁移、恢复、应用与组合根 |
| 浏览器 | 12/12 | 新生产入口、票座一致、无障碍门控、锁座跨刷新恢复/释放、访客确认、幂等、响应式、Dialog、键盘、DOM 安全、运行时健康 |
| 视口 | 320/390/768/1024/1440 | 页面无横向溢出；手机座位图只在内部容器滚动 |
| 手工浏览器 | 1440×1000、390×844 | 完整“推荐 → 锁座 → 注册 → 确认 → 取票码 → 我的订单”闭环 |

浏览器页面完成后必须显示：

```text
PASS 12 · XFAIL 0 · XPASS 0 · ERROR 0
```

## 3. Node 套件

`tests/runner.js` 显式登记所有套件，不自动发现文件。

### v2/legacy 回归

- `test-seatdata.js`：三种旧影厅与选择；
- `test-recommend.js` / `test-score.js`：旧推荐和评分；
- `test-domain-contracts.js`：v2 标识、库存、选择、用户和订单；
- `test-storage-v2.js` / `test-state-backup.js` / `test-migration-v2.js`；
- `test-application-v2.js` / `test-derived-state.js` / `test-app-controller.js`；
- `test-ui-controllers.js` / `test-canvas-interaction.js` / `test-view-adapters.js`；
- `test-realtime-v2.js` / `test-regressions.js`。

这些测试在 `legacy.html` 最终退出前保持，用于证明 v3 迁移没有破坏既有正确行为。

### 商业 v3

- `test-commercial-domain.js`：Money、Catalog、BookingDraft、PricingQuote、孤座/跨区/无障碍规则、Inventory、SeatHold、CommercialOrder；
- `test-storage-v3.js`：v3 envelope、revision、hold/库存/订单交叉引用、冻结 v2 fixture 迁移；
- `test-commercial-application.js`：场次上下文、草稿、原子锁座、幂等、冲突、释放、过期和访客确认；
- `test-commercial-composition.js`：空白安装的 v1→v2→v3、营业日、演示库存、v3 账户、推荐和报价。

新增测试文件必须在 `tests/runner.js` 中导入并运行，否则 `npm test` 不会覆盖。

## 4. 浏览器商业流程契约

`tests/browser-regressions.js` 通过同源 iframe 操作真实 `index.html`、Storage v3 和生产事件处理器，不导入页面实现对象。

1. `UX-001`：生产入口是场次/票/座/摘要漏斗，不出现 Canvas、热图或购前评分；
2. `UX-002`：票数、推荐连座、价格和 CTA 一致；
3. `UX-003`：陪同席联动轮椅位，无障碍用途确认前不能继续；
4. `UX-004`：刷新会恢复同一会话的有效 hold 与倒计时，关闭确认页会 release 整组 hold 和库存映射；
5. `UX-005`：访客注册后确认，快速重复提交只产生一个订单；
6. `UX-006`：320–1440px 无页面溢出，手机座位图形成内部滚动；
7. `BUG-007`：登录/注册支持原生 submit/Enter；
8. `BUG-008`：内容拖出和背景点击均不关闭认证 Dialog；
9. `BUG-009`：关闭键、Escape、焦点归还；叠层中只关闭最上层；
10. `A11Y-001`：单一 Tab 停点、方向键、Space 和重绘后焦点保持；
11. `SEC-001`：用户字段只作为文本渲染；
12. `QA-001`：核心流程 0 个未处理 error/unhandledrejection。

## 5. 人工验收清单

### 场次与票种

- [ ] 影片、影院、地址、日期、时间、影厅、制式和语言一致；
- [ ] 已停售场次不可选择，营业日末场停售后自动进入次日；
- [ ] 每个票种的资格说明和价格清楚；
- [ ] 总票数不能小于 1 或超过 8；
- [ ] 改票数会清除不再可靠的座位选择。

### 座位与推荐

- [ ] 鼠标点击和触控滚动不触发页面级横向滚动；
- [ ] Tab 只进入座位图一次，方向键逐座移动，Space 选择且焦点不丢失；
- [ ] 读屏逐座读出排、座、附加费、类型和状态；
- [ ] 推荐返回与票数相同的同排同区连续座位；
- [ ] 票数选满后点击其他座位有明确提示；
- [ ] 跨过道选择被阻止，孤座规则只归因于本次选择；
- [ ] 陪同席自动联动轮椅位，用途未确认前 CTA 禁用。

### 锁座、身份与订单

- [ ] 继续后显示 10 分钟倒计时、票座明细、费用和退改政策；
- [ ] 返回改座、关闭确认页和超时均释放整组座位；
- [x] 访客锁座后登录/注册和同会话刷新均不丢失 hold；
- [ ] 登录背景点击与输入拖出不关闭；显式关闭或 Escape 才退出；
- [ ] 认证叠在确认页时，Escape 只关闭认证层；
- [ ] 重复确认不产生第二个订单；
- [ ] 成功页取票码可读且座位进入 sold；
- [ ] “我的订单”只显示当前用户订单，字段作为纯文本渲染。

### 响应式与视觉

- [ ] 320、390、768、1024、1440px 页面无横向滚动；
- [ ] 手机底栏不被安全区/浏览器底栏遮挡；
- [ ] 桌面 summary sticky 不覆盖页尾；
- [ ] 高对比、色盲和大字体下状态仍不只依赖颜色；
- [ ] reduced-motion 下 Dialog 无位移/缩放；
- [ ] 浏览器控制台无未解释错误。

## 6. 测试设计约束

- 领域/应用测试不得依赖真实时间、随机数或远端服务；Clock 和 IdGenerator 必须注入；
- 浏览器测试可验证真实时钟驱动 UI，但必须使用独立 origin 并清理自己的数据；
- 演示已售库存必须确定性生成，重复启动得到相同结果；
- 价格断言使用整数分 Money，不使用浮点金额；
- 每个 hold 相关测试同时断言 hold 状态和 inventory 映射；
- DOM 安全测试使用带 HTML 片段的文本验证 `textContent`，不得执行脚本；
- Bug 修复先建立失败契约，再转为普通 PASS；长期套件不保留不解释的 XFAIL；
- UI 改动除自动化外必须查看真实桌面和手机截图。

## 7. 已知未覆盖

并发冲突一键重选、取消/退款、二维码、真实支付、多日目录、内部工具拆分、真实读屏和完整辅助模式人工验收仍在商业路线图后续阶段。

## 8. 相关文档

- `doc/COMMERCIAL_UX_ROADMAP.md`：当前长期计划和退出门槛；
- `doc/COMMERCIAL_UX_PHASE_2_QA.md`：本阶段浏览器证据；
- `doc/RFC_COMMERCIAL_DOMAIN_V3.md`：商业领域与存储契约；
- `doc/REFACTOR_TEST_MATRIX.md`：旧技术重构的 Bug 覆盖映射。
