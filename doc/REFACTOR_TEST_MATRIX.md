# SmartCinema 重构回归测试矩阵

> 建立日期：2026-07-18
> 当前状态：13 个登记缺陷全部关闭；Node 105/105，浏览器 PASS 12（11 个缺陷契约 + 1 个运行时健康检查），XFAIL/XPASS/ERROR 均为 0。

## 1. 入口

Node：

```bash
npm test
```

浏览器：先运行 `npm start`，再打开：

```text
http://127.0.0.1:8080/tests/browser-regressions.html
```

必须使用 `127.0.0.1`，不要替换为 `localhost`。测试页会清理当前 origin 下的 `smartcinema_` 数据；独立 hostname 可隔离日常使用数据。

## 2. XFAIL 规则

阶段 1 曾使用 XFAIL 固化旧实现缺陷；当前所有契约都已转为普通回归。

- 只有明确的 `ContractFailure` 可以记为 XFAIL；
- 测试准备、加载、选择器或运行时异常必须记为 ERROR；
- 修复后意外继续保留 XFAIL 会显示 XPASS，并视为测试失败；
- 当前验收要求 XFAIL、XPASS、ERROR 全部为 0。

## 3. Bug 与证据映射

| ID | 状态 | 入口 | 持续契约 |
| --- | --- | --- | --- |
| BUG-001 | PASS | 浏览器 | Inventory 使用影厅+日期组成的 `showtimeId` 隔离 |
| BUG-002 | PASS | Node | 创建、查询、取消订单均按稳定 `userId` 授权 |
| BUG-003 | PASS | 浏览器 + Node | 同一 CheckoutIntent 最多生成一个订单，按钮首次提交即禁用 |
| BUG-004 | PASS | Node | RemoteHold 不进入 LocalSelection |
| BUG-005 | PASS | 浏览器 | 文本编辑 Ctrl+Z 不触发全局选座动作 |
| BUG-006 | PASS | 浏览器 + Node | 320–1440px 默认/无障碍模式无页面溢出，Canvas 首末座位均可见 |
| BUG-007 | PASS | 浏览器 | 登录/注册使用原生 form submit，Enter 可提交 |
| BUG-008 | PASS | 浏览器 | 仅按下与释放都在遮罩时才允许 backdrop 关闭；脏表单不因遮罩点击丢失 |
| BUG-009 | PASS | 浏览器 | Dialog 有语义关闭键、Escape、焦点陷阱与焦点归还 |
| BUG-010 | PASS | 浏览器 | 语音、realtime 控件、持久设置和运行时副作用一致恢复 |
| BUG-011 | PASS | 浏览器 + Node | 座位或库存变化立即使旧推荐/评分失效 |
| BUG-012 | PASS | 浏览器 | 快捷键帮助与 Ctrl/Cmd+E、I、K 实际处理器一致 |
| BUG-013 | PASS | 浏览器 + Node | 用户可控账户、管理员、订单、推荐和聊天字段仅按文本渲染 |

## 4. 确定性与隔离

- realtime 测试注入固定随机序列、Clock、IdGenerator 和 scheduler；
- 库存测试寻找两个日期都可用的确定性座位；
- 支付测试通过 v2 CheckoutIntent 和唯一用户运行；
- 浏览器契约在同源 iframe 中运行真实生产入口，并在完成后销毁 iframe；
- 视口固定覆盖 320、390、768、800、900、1024、1440px；
- Canvas 响应式同时验证页面滚动宽度和每个座位的实际绘制坐标；
- `QA-001` 汇总核心交互期间的 `error` 与 `unhandledrejection`；浏览器入口预期固定为 PASS 12、XFAIL 0、XPASS 0、ERROR 0。

## 5. 维护规则

1. 新缺陷先建立能稳定失败的最小契约；
2. 数据/领域问题优先放 Node，真实 DOM、Canvas、跨页或浏览器语义问题放浏览器入口；
3. 修复和测试转正必须在同一变更内完成；
4. 新测试文件必须登记到 `tests/runner.js`；
5. 任何 UI 改动还需运行 `tests/visual-review.html` 或提供等价真实截图；
6. 更新测试数量和状态时同时修改 `README.md`、`TESTING.md` 与重构路线图。
