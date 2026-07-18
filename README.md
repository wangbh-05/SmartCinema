# SmartCinema

SmartCinema 是一个无运行时依赖的原生 JavaScript 影院选座应用。它使用 Canvas 呈现三种影厅，提供注册登录、规则推荐、体验评分、订单确认与退票、热度地图、实时占座模拟、数据备份以及键盘/辅助显示支持。

## 快速开始

要求：Node.js 18 或更高版本。

```bash
npm install
npm start
```

应用地址：`http://localhost:8080`

```bash
npm test
```

项目不需要打包器；`npm run build` 和 `npm run lint` 当前只是说明性占位命令。

## 核心能力

- 小厅、中厅、大厅分别提供 100、200、300 个座位；
- 鼠标、Pointer 拖选与键盘方向键、Enter/Space 均可操作 Canvas；
- 推荐规则考虑人数、少年/成年/老年以及情侣、朋友、亲子场景；
- 系统评分覆盖视野、舒适度、银幕距离和价格，并可与用户评分合并；
- 已售库存以 `showtimeId` 按影厅和日期隔离；
- 订单按稳定 `userId` 隔离，确认支付具有幂等保护；
- 本地选择、远端临时占座和已售库存是三个独立状态；
- 登录/注册 Dialog 支持关闭按钮、Escape、焦点陷阱与焦点归还，拖动越界不会误关闭；
- 支持深浅主题、自定义强调色、大字体、色盲配色、语音提示和 reduced-motion；
- 安全备份默认不导出凭据，完整备份会在明确确认后包含本地演示账号凭据。

## 当前结构

```text
SmartCinema/
├── index.html                  # 选座首页
├── order.html                  # 订单确认页
├── public/styles/
│   ├── variables.css           # 颜色、间距、圆角、阴影与层级 tokens
│   ├── app.css                 # 首页设计系统、组件与响应式布局
│   ├── order.css               # 结算页布局
│   └── accessibility.css       # 焦点、高对比度与 reduced-motion
├── src/
│   ├── domain/                 # Hall、Showtime、Inventory、Order、User 等纯领域对象
│   ├── application/            # 认证、选座、推荐、评分、结算等用例
│   ├── infrastructure/         # Storage v2、迁移、浏览器和 realtime 适配
│   ├── ui/
│   │   ├── adapters/           # AppState 到页面视图的投影
│   │   ├── canvas/             # Canvas 布局、输入与绘制
│   │   ├── components/         # Dialog、Toast
│   │   └── controllers/        # 页面功能控制器
│   ├── app.js                  # 首页组合与薄事件编排
│   ├── order.js                # 结算页入口
│   └── bootstrap.js            # 依赖组合根
├── tests/                      # Node 契约、浏览器回归与视觉审查入口
└── doc/                        # 架构、领域、存储、路线图与 QA 文档
```

依赖方向为：

```text
UI → Application → Domain / Shared
Infrastructure ───────────┘
```

领域层和应用层不访问 DOM、Canvas、LocalStorage、系统时间或随机源。浏览器能力只在基础设施和组合根注入；UI 不直接读写存储。

## 状态与持久化

当前持久化使用单一 v2 state envelope：

- `smartcinema_state_v2`：用户、session、订单、按场次库存和设置；
- `smartcinema_checkout_v2`：当前标签页的结算意图，存于 SessionStorage；
- `smartcinema_v1_backup`：首次迁移旧数据前的备份；
- `smartcinema_import_backup_v2`：导入替换前的可恢复快照。

Repository 在写入前校验完整 candidate，并使用 revision 检测冲突。旧数据无法可靠推断用户或场次时会进入 quarantine，不会猜测归属。完整协议见 [Storage Schema v2](doc/STORAGE_SCHEMA_V2.md)。

> 这是本地课程型应用，不是生产认证系统。演示账号密码仍存于本机浏览器；不要录入真实凭据，也不要分享完整备份。

## 测试与验收

Node 测试：

```bash
npm test
```

浏览器回归：先运行 `npm start`，再打开：

```text
http://127.0.0.1:8080/tests/browser-regressions.html
```

必须使用 `127.0.0.1`。测试页会清理该 origin 下的 `smartcinema_` 数据，从而与日常使用的 `localhost` 数据隔离。

窄屏视觉审查：

```text
http://127.0.0.1:8080/tests/visual-review.html
```

当前自动化覆盖 105 个 Node 测试、11 个真实浏览器缺陷契约和 1 个运行时健康检查，包括 320–1440px 默认/无障碍布局、Canvas 首末座位可见性、弹窗指针手势、重复支付和安全文本渲染。详细说明见 [TESTING.md](TESTING.md)。

## 交互说明

- Canvas 聚焦后可用方向键移动焦点，Enter 或 Space 切换座位；
- 窄屏可用座位图缩放控件在 100%–400% 间放大，并在 Canvas 容器内横向浏览；
- `Ctrl/Cmd + K` 打开快捷键帮助；
- `Ctrl/Cmd + E` 导出不含凭据的安全备份；
- `Ctrl/Cmd + I` 打开备份导入；
- 快捷键不会劫持 input、textarea、select 或 contenteditable 的编辑行为；
- 色盲模式会同时更新座位图与热度图；
- `prefers-reduced-motion: reduce` 会关闭非必要位移和 Canvas 弹性反馈。

## 主要文档

- [长程重构路线图](doc/REFACTOR_ROADMAP.md)
- [目标架构](doc/REFACTOR_ARCHITECTURE.md)
- [领域契约](doc/DOMAIN_CONTRACTS.md)
- [Storage v2](doc/STORAGE_SCHEMA_V2.md)
- [回归测试矩阵](doc/REFACTOR_TEST_MATRIX.md)
- [2026-07-18 QA 报告](doc/QA_REPORT_2026-07-18.md)
- [测试指南](TESTING.md)

## 许可证

MIT
