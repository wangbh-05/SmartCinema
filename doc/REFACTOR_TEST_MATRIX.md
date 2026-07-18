# SmartCinema 重构回归测试矩阵

> 建立日期：2026-07-18
> 对应阶段：`doc/REFACTOR_ROADMAP.md` 阶段 1
> 当前状态：5 个状态类 Bug 已转为普通回归测试，7 个交互/响应式 Bug 保持 XFAIL

## 1. XFAIL 约定

阶段 1 使用预期失败（XFAIL）固定目标契约：

- 只有明确的 `ContractFailure` 才能计为“已知缺陷稳定复现”；
- 测试准备、加载、选择器或运行时异常计为 ERROR/普通失败；
- 目标契约意外通过计为 XPASS，提醒维护者在同一修复中把该项转为普通回归测试；
- 阶段 4 关闭 Bug 时，必须删除对应 XFAIL 预期，让目标行为成为持续通过的普通测试；
- 不允许长期用 XFAIL 掩盖已经完成或已经改变定义的行为。

## 2. Node 契约入口

运行：

```bash
npm test
```

无全局 `npm` 时可运行：

```bash
/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/runner.js
```

阶段 1 实测期望：

- 原有测试：25/25 通过；
- `BUG-002`、`BUG-004`：2 个 XFAIL；
- 非预期失败：0。

`tests/runner.js` 现在会在普通失败、测试准备错误或 XPASS 时设置非零退出码。

阶段 3 当前实测：75/75 通过，`BUG-002`、`BUG-004` 已转为普通回归测试，Node XFAIL 为 0。

## 3. 浏览器契约入口

先启动开发服务器：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:8080/tests/browser-regressions.html
```

必须使用 `127.0.0.1`，不要替换为 `localhost`。浏览器 origin 包含 hostname，因此该入口可以清理测试数据而不触碰日常在 `http://localhost:8080` 使用的 LocalStorage。

阶段 1 实测期望：

- XFAIL：10；
- XPASS：0；
- ERROR：0；
- 页面状态：`完成：10 个已知问题稳定复现`。

阶段 3 当前实测：

- PASS：3（`BUG-001`、`BUG-003`、`BUG-010`）；
- XFAIL：7；
- XPASS：0；
- ERROR：0；
- 页面状态：`完成：3 个修复通过，7 个已知问题稳定复现`。

结果截图：`/Users/a1/.codex/visualizations/2026/07/17/019f725b-685f-7d91-8dfb-0c4675dbfee7/smartcinema-stage1-regression-contracts.png`

## 4. Bug 与证据映射

| ID | 状态 | 测试入口 | 阶段 1 失败事实 | 持续契约 |
| --- | --- | --- | --- | --- |
| BUG-001 | PASS | 浏览器 | 周四售出的 `0-0` 污染周五库存 | 已售库存由影厅+日期的 `showtimeId` 隔离 |
| BUG-002 | PASS | Node | 查询 user-a 返回两个用户的订单，订单没有稳定 `userId` | 创建、查询、取消和收据均受 userId 权限约束 |
| BUG-003 | PASS | 浏览器 | 快速双击“确认支付”创建 2 个订单 | 同一结算意图最多生成 1 个订单 |
| BUG-004 | PASS | Node | 远端 select 直接修改 `selectedSeats/isSelected` | RemoteHold 与 LocalSelection 分离 |
| BUG-005 | XFAIL | 浏览器 | 输入框内 Ctrl+Z 清空已选座位 | 文本编辑快捷键不触发全局选座动作 |
| BUG-006 | XFAIL | 浏览器 | 320、390、768、800、900、1024px 均横向溢出 | 320–1440px 矩阵全部无页面级横向溢出 |
| BUG-007 | XFAIL | 浏览器 | Enter 没有运行认证或显示错误 | 登录/注册使用原生 form submit 语义 |
| BUG-008 | XFAIL | 浏览器 | 从内容开始、在遮罩释放的拖动会关闭弹窗 | 仅按下和释放均在遮罩时关闭 |
| BUG-009 | XFAIL | 浏览器 | 无语义关闭键，Escape 不关闭 | 有可访问关闭键、Escape、焦点归还 |
| BUG-010 | PASS | 浏览器 | 刷新后语音/实时均为 false，实时未启动 | 控件、存储和运行时状态一致恢复 |
| BUG-011 | XFAIL | 浏览器 | 清空座位后旧综合评分仍可见 | 座位输入变化立即使派生评分失效 |
| BUG-012 | XFAIL | 浏览器 | 帮助声明 Ctrl+E/I，实际处理次数为 0/0 | 帮助内容与实际处理器逐项一致 |

## 5. 确定性与隔离

- Node realtime v2 测试使用固定随机序列、注入 Clock/IdGenerator 和受控 scheduler，不等待真实时间；
- 浏览器库存测试寻找两个日期都可用的确定性座位；
- 重复支付测试使用固定用户和 v2 CheckoutIntent；
- 每个浏览器契约创建并销毁自己的 iframe；
- 浏览器测试运行在独立 origin，并在开始和结束时清理 `smartcinema_` 测试数据；
- 响应式测试固定覆盖 320、390、768、800、900、1024、1440px。

## 6. 阶段 4 的迁移规则

每关闭一个 Bug：

1. 先运行当前 XFAIL，确认它失败于预期契约而不是准备错误；
2. 实施架构内修复；
3. 将该项从 `xfail(...)` 改为普通通过测试；
4. 验证修复不会使其他 XFAIL 变成未解释的 XPASS；
5. 在路线图 Bug 台账中写入测试、代码和浏览器证据；
6. 只有普通测试持续通过后才勾选对应 Bug。
