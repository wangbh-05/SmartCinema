# SmartCinema

SmartCinema 是一个无运行时依赖的原生 JavaScript 商业影院购票演示。生产入口遵循“场次 → 票种/票数 → 座位 → 锁座 → 身份 → 订单”的交易漏斗，使用 Storage v3 保存场次库存、有效锁座和不可变订单快照。

当前重构在 `zcjx/smart_cinema` 分支进行。`internal.html` 是受管理员权限保护的 v3 放映运维入口；唯一消费者入口是 `index.html`，且消费者导航不暴露任何内部工具。旧 Canvas、热图、购前评分、模拟与跨页结算链已经退出仓库。

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

项目不需要打包器；`npm run build` 和 `npm run lint` 当前是说明性占位命令。

## 当前商业流程

- 展示电影、影院、地址、日期、具体时间、影厅、制式、语言和退改政策；
- 成人/儿童/学生/长者票步进器，单笔限制 1–8 张；
- 票数必须与座位数严格一致；
- 180 个语义化 DOM 座位按钮，区分可选、已选、已售/锁定、优选区、轮椅位和陪同席；
- “帮我选连座”只使用票数和靠中/靠后/过道/无台阶偏好，不收集成员姓名或关系；
- 桌面 sticky 订单摘要，手机固定底栏持续显示已选数量、总价和下一步；
- 价格由票种、座位区和服务费政策统一报价，UI 不自行求价；
- 继续后原子创建 10 分钟 `SeatHold`，关闭/超时会释放库存；
- 访客可先锁座，仅在确认订单前登录或注册；
- 确认操作幂等，成功后生成紧凑取票码并进入“我的订单”；
- 登录 Dialog 有显式关闭键、焦点陷阱、焦点归还和弹窗栈；背景点击或内容拖出不会误关闭。

本地演示目录使用虚构影片“星际回响”和固定影院，演示库存是确定性生成的，不依赖网络或随机运行时状态。

## 代码结构

```text
SmartCinema/
├── index.html                         # 商业购票生产入口
├── internal.html                      # noindex v3 放映运维入口
├── public/styles/
│   ├── commercial.css                 # 新交易外壳、DOM 座位和响应式
│   ├── operations.css                 # 内部运维、表格和危险操作
│   ├── variables.css                  # 共享 tokens
│   └── accessibility.css              # 焦点、高对比与 reduced-motion
├── src/
│   ├── domain/
│   │   ├── catalog/                   # Movie/Cinema/Auditorium/Showtime/票价政策
│   │   ├── booking/                   # BookingDraft/Inventory/SeatHold/选座规则
│   │   ├── order/                     # v3 不可变商业订单快照
│   │   └── user/                      # 用户与设置
│   ├── application/
│   │   └── commercial/                # 购票、账户、推荐、偏好和运维用例
│   ├── infrastructure/
│   │   ├── catalog/                   # 演示目录与确定性库存
│   │   ├── storage/                   # Storage v2/v3、迁移和 session owner
│   │   └── browser/                   # Clock、IdGenerator、营业日
│   ├── ui/                            # Dialog、商业座位/结算/订单/偏好/运维 controller
│   ├── commercial.js                  # 新生产页面交易编排
│   ├── internal.js                    # v3 运维页面启动
│   ├── bootstrapCommercial.js         # v3 生产组合根
│   └── bootstrapInternal.js           # v3 运维组合根
├── tests/                             # Node 契约与真实浏览器流程
└── doc/                               # RFC、路线图、迁移与 QA
```

依赖方向：

```text
UI → Application → Domain / Shared
Infrastructure ───────────┘
```

领域和应用层不访问 DOM、LocalStorage、系统时间或随机源；基础设施通过组合根注入，生产 UI 不直接读写 Web Storage。

## 状态与迁移

当前生产事实源是 `smartcinema_state_v3`：

- `usersById` / `session`；
- `ordersById`：商业订单与 legacy 订单快照；
- `inventoriesByShowtime`：已售座位和 hold 映射；
- `holdsById`：pending/held/expired/released/consumed；
- `settingsByUser`；
- revision、更新时间和 migration 报告。

启动会先保证 v2 存在，再幂等执行 v2→v3 迁移。原 v2 key 不删除，并在 `smartcinema_state_v2_before_v3` 保存迁移前备份；旧订单缺少的电影、影院和具体时间使用显式 `legacy-*`/`unknown`，不会编造事实。完整契约见 [RFC Commercial Domain v3](doc/RFC_COMMERCIAL_DOMAIN_V3.md)。

> 这是本地演示，不是生产认证或支付系统。演示密码仍以明文凭据保存在本机浏览器，请勿录入真实密码或个人数据。

## 交互与可访问性

- 座位图使用 roving tabindex：Tab 进入一次，方向键逐座移动，Space 选择；
- 每个座位读出排号、座号、座位附加费、类型和当前状态；
- 手机座位图只在自身容器横向滚动，页面本身在 320px 不横向溢出；
- 陪同席自动联动对应轮椅位，用途确认前不能继续；
- `prefers-reduced-motion: reduce` 移除 Dialog 的位移/缩放；
- 高频选座不使用位移动画，hover 仅对精确指针启用；
- 多层 Dialog 只允许最上层响应 Escape，关闭后焦点归还原触发点。

## 测试与验收

Node 全量：

```bash
npm test
# 82/82 PASS
```

启动服务后，以独立 origin 打开浏览器契约：

```text
http://127.0.0.1:8080/tests/browser-regressions.html
# PASS 18 · XFAIL 0 · XPASS 0 · ERROR 0
```

测试页会清理 `127.0.0.1` 下的 `smartcinema_` 数据，不影响日常使用的 `localhost` 数据。浏览器契约覆盖商业入口、票座一致、无障碍门控、跨刷新恢复有效锁座、抢座冲突恢复、显式释放、访客确认、重复提交、政策驱动整单退票、账户辅助偏好、320–1440px、Dialog 指针/Escape/焦点、键盘选座、运维权限与人工释放锁座、安全文本和运行时错误。详细说明见 [TESTING.md](TESTING.md)。

## 当前边界

仍在后续阶段中的能力：多日/多电影/多影院目录、真实支付与支付渠道退款回调、二维码、完整账户资料、真实读屏和完整辅助模式人工验收。v2 validator、迁移 fixture 与旧订单模型只承担历史数据兼容，不构成第二套产品 UI。

## 主要文档

- [商业产品与体验路线图](doc/COMMERCIAL_UX_ROADMAP.md)
- [v3 运维与旧链退出 QA](doc/COMMERCIAL_UX_PHASE_5_QA.md)
- [商业纵向切片 QA](doc/COMMERCIAL_UX_PHASE_2_QA.md)
- [商业领域 v3 RFC](doc/RFC_COMMERCIAL_DOMAIN_V3.md)
- [商业基线](doc/COMMERCIAL_UX_BASELINE.md)
- [内部工具边界](doc/INTERNAL_TOOLS_BOUNDARY.md)
- [已完成技术重构路线图](doc/REFACTOR_ROADMAP.md)
- [测试指南](TESTING.md)

## 许可证

MIT
