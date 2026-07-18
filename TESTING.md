# SmartCinema 测试指南

> 当前事实日期：2026-07-18。历史测试数量与旧模块名称不再代表当前实现；阶段证据见 `doc/REFACTOR_ROADMAP.md`。

## 1. 测试入口

安装并启动：

```bash
npm install
npm start
```

Node 全量测试：

```bash
npm test
```

浏览器缺陷回归：

```text
http://127.0.0.1:8080/tests/browser-regressions.html
```

窄屏视觉审查：

```text
http://127.0.0.1:8080/tests/visual-review.html
```

浏览器测试必须使用 `127.0.0.1`，不能改成 `localhost`。测试入口会删除当前 origin 下以 `smartcinema_` 开头的数据；独立 hostname 可避免影响日常数据。

## 2. 当前自动化范围

| 层级 | 当前证据 | 主要覆盖 |
| --- | ---: | --- |
| Node | 105/105 | 领域契约、Storage v2、迁移、备份、认证、订单、推荐、评分、realtime、UI 控制器、Canvas 输入与视图适配 |
| 浏览器 | 12/12 | 11 个缺陷契约；另检查核心交互中未处理的 error/unhandledrejection |
| 视口矩阵 | 7 × 2 模式 | 320、390、768、800、900、1024、1440px；默认与无障碍大字体 |
| 视觉审查 | 320/390px | 头部、触控控件、完整 Canvas、图例和推荐表单密度 |

Node runner 在普通失败、准备错误或意外 XPASS 时返回非零退出码。浏览器页面完成后应显示：

```text
PASS 12 · XFAIL 0 · XPASS 0 · ERROR 0
```

## 3. Node 套件

`tests/runner.js` 当前加载：

- `test-seatdata.js`：三种影厅、确定性座位与选择；
- `test-recommend.js`：年龄限制、人数和连续座位规则；
- `test-score.js`：四维评分和等级；
- `test-domain-contracts.js`：标识符、Inventory、Selection、RemoteHold、User、Order；
- `test-storage-v2.js`：校验、revision、CheckoutIntent 和原子写入；
- `test-state-backup.js`：安全/完整备份、导入校验与回滚；
- `test-migration-v2.js`：v1 备份、迁移与 quarantine；
- `test-application-v2.js`：认证、订单、权限、幂等和库存；
- `test-derived-state.js`：推荐、系统评分与综合评分失效；
- `test-app-controller.js`：组合后的应用状态同步；
- `test-ui-controllers.js`：设置、Toast、Dialog 使用方、聊天顺序和安全 DOM；
- `test-canvas-interaction.js`：布局边界、Pointer capture、拖选、取消与键盘；
- `test-view-adapters.js`：账户、订单与 SeatData 投影；
- `test-realtime-v2.js`：远端 hold/purchase 与本地选择隔离；
- `test-regressions.js`：稳定 userId 订单隔离和 RemoteHold 回归。

新增测试文件后，必须在 `tests/runner.js` 中显式导入和登记，否则 `npm test` 不会自动发现。

## 4. 浏览器回归契约

浏览器入口使用同源 iframe 运行真实 `index.html` 和 `order.html`，不是替代实现。当前契约包括：

1. 已售库存按影厅与日期隔离；
2. 快速重复支付只产生一个订单；
3. 文本输入中的 Ctrl+Z 不清空座位；
4. 目标视口无页面溢出，Canvas 首末座位均在绘制边界内；
5. 登录/注册可用 Enter 提交；
6. 内容区开始的拖动不会在遮罩释放时误关闭；
7. Dialog 有语义关闭键、Escape 和焦点归还；
8. 语音与 realtime 设置可持久恢复；
9. 座位变化会使旧综合评分失效；
10. 快捷键帮助与真实处理器一致；
11. 用户可控账户字段只作为文本渲染。

此外，`QA-001` 汇总所有测试 iframe 在核心交互期间产生的 `error` 与 `unhandledrejection`，任何未处理浏览器异常都会使矩阵失败。

响应式契约会在默认与无障碍模式下分别运行 320–1440px 全矩阵；仅检查 `scrollWidth` 不够，测试还会验证所有 Canvas 座位坐标都处于实际绘制宽度内。

## 5. 人工验收清单

### 认证与 Dialog

- [ ] 登录、注册的显式关闭按钮始终可见；
- [ ] Escape 关闭并把焦点归还给原触发按钮；
- [ ] 内容区拖到遮罩释放不会关闭；
- [ ] 表单已有输入后点击遮罩不会丢失内容；
- [ ] 显式关闭后重新打开，密码和错误信息已清空；
- [ ] 小高度视口内内容可滚动。

### 选座、推荐与评分

- [ ] 鼠标点击、拖选、越界释放与 pointercancel 正常；
- [ ] Canvas 方向键、Enter、Space 可操作，焦点清晰；
- [ ] 已售和 remote-held 座位不可加入本地选择；
- [ ] 少年、老年、情侣、朋友、亲子推荐符合规则；
- [ ] 应用推荐后订单摘要和系统评分同步更新；
- [ ] 清空/切换影厅/日期后旧推荐和综合评分消失。

### 订单

- [ ] 未登录会打开登录 Dialog，不会创建 CheckoutIntent；
- [ ] 确认页用户、场次、座位和金额正确；
- [ ] 确认支付首次点击后立即禁用；
- [ ] 取消确认会清除 CheckoutIntent 且不创建订单；
- [ ] 历史订单仅显示当前用户订单；
- [ ] 退票后库存释放，其他日期库存不变。

### 设置与备份

- [ ] 深/浅主题和强调色在刷新后恢复；
- [ ] 无障碍模式在 320px 下无横向溢出；
- [ ] 色盲模式同时改变座位图和热度图；
- [ ] reduced-motion 下 Dialog/Chat 无位移动效，Canvas 不弹跳；
- [ ] “导出安全备份”不询问凭据风险；
- [ ] “导出完整备份”明确警告，取消后不下载；
- [ ] 损坏或错误版本备份不会覆盖现有数据。

### 响应式

- [ ] 320、390、768、800、900、1024、1440px 页面无横向滚动；
- [ ] 20/30 列影厅的首末座位和图例可见，放大后只在 Canvas 容器内滚动；
- [ ] 触控目标、表单标签和按钮无重叠；
- [ ] 结算页 320px 下操作按钮改为单列；
- [ ] 浏览器控制台无未解释错误。

## 6. 测试设计约束

- 不依赖真实时间、随机数或远端服务；Clock、IdGenerator、随机源和 scheduler 必须注入；
- 每个测试只清理自己的 `smartcinema_` 数据；
- 浏览器测试使用固定用户或唯一用户名，并销毁创建的 iframe；
- DOM 安全测试使用带 HTML 片段的文本验证 `textContent`，不能执行脚本；
- 修复 Bug 时先让契约稳定复现，再把 XFAIL 转为普通回归；当前不应存在长期 XFAIL；
- UI 改动除自动化外必须检查真实截图或 `tests/visual-review.html`。

## 7. 相关文档

- `doc/REFACTOR_TEST_MATRIX.md`：Bug 到测试入口的映射；
- `doc/REFACTOR_ARCHITECTURE.md`：边界与依赖方向；
- `doc/STORAGE_SCHEMA_V2.md`：存储、迁移、备份和恢复；
- `doc/REFACTOR_ROADMAP.md`：阶段退出门槛与当前证据。
