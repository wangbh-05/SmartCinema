# SmartCinema Storage Schema v2

> 状态：Accepted for implementation
> Schema version：2
> 日期：2026-07-18

## 1. 设计原则

1. 订单、库存、用户和设置只有一个可写事实源；
2. 订单确认与库存售出必须在一个 JSON envelope 写入中提交；
3. 所有读取先解析再校验，损坏数据不能进入领域；
4. v1 原始数据先备份再迁移，不在验证成功前删除；
5. 无法可靠推断归属或日期的数据进入 quarantine，不静默猜测；
6. UI、Canvas 和页面脚本不直接访问 Storage API；
7. RemoteHold、推荐和评分不持久化。

## 2. Storage keys

| Storage | Key | 用途 |
| --- | --- | --- |
| LocalStorage | `smartcinema_state_v2` | 当前唯一可写持久状态 envelope |
| LocalStorage | `smartcinema_migration_backup_v1` | 首次迁移前的 v1 原始字符串备份 |
| LocalStorage | `smartcinema_migration_report_v2` | 迁移时间、警告、quarantine 摘要 |
| SessionStorage | `smartcinema_checkout_v2` | 当前标签页 CheckoutIntent |

临时写入可使用 `smartcinema_state_v2_candidate`；验证并写入正式 key 后立即删除。应用启动永远不把 candidate 当正式状态。

## 3. State envelope

```js
{
    schemaVersion: 2,
    revision: 0,
    updatedAt: '2026-07-18T00:00:00.000Z',
    usersById: {
        'admin_001': {
            id: 'admin_001',
            username: 'admin',
            credential: { kind: 'demo-plaintext', value: 'admin123' },
            name: '系统管理员',
            email: 'admin@smartcinema.com',
            role: 'admin',
            createdAt: '2026-07-18T00:00:00.000Z'
        }
    },
    session: {
        userId: 'admin_001',
        loginAt: '2026-07-18T00:00:00.000Z'
    },
    ordersById: {},
    inventoriesByShowtime: {
        'medium:day:3': {
            showtimeId: 'medium:day:3',
            revision: 0,
            soldSeatKeys: [],
            updatedAt: '2026-07-18T00:00:00.000Z'
        }
    },
    settingsByUser: {
        guest: {
            theme: 'dark',
            accessibilityMode: false,
            colorblindMode: false,
            voiceEnabled: false,
            realtimeEnabled: false,
            accentColor: '#58A6FF',
            reducedMotion: 'system',
            language: 'zh-CN'
        }
    },
    migration: {
        fromVersion: null,
        completedAt: null,
        warnings: []
    }
}
```

### 不建立重复索引

- 不同时保存 `orders` 数组和 `ordersById`；
- 不保存 `orderIdsByUser`，小型本地数据查询时按 userId 过滤；
- 不在 Seat 对象和 inventory 两处保存 sold；
- 不持久化 totalOrders、availableCount 等可推导统计。

## 4. 校验规则

### Envelope

- 必须是 plain object；
- `schemaVersion === 2`；
- revision 为非负整数；
- updatedAt 为可解析 ISO string；
- 所有 required map 都存在且为 plain object；
- 未知字段在 import 时拒绝或由显式版本迁移处理，不静默透传可执行对象。

### Users

- map key 必须等于 user.id；
- username 去空格后至少 3 字符且全局唯一；
- role 为 `member | admin | system`；
- session.userId 必须引用存在且非 system 的用户；
- 对外返回用户时永远移除 credential。

### Orders

- map key 必须等于 order.id；
- userId 必须引用存在用户；
- showtimeId、SeatKey、状态与时间满足 `DOMAIN_CONTRACTS.md`；
- idempotencyKey 全局唯一；
- totalPrice 必须等于 seats.unitPrice 之和；
- confirmed order 的 seatKeys 必须存在于对应 inventory；
- cancelled order 的 seatKeys 不得仅因该订单继续存在于 inventory；若与其他订单冲突则状态损坏。

### Inventories

- map key 等于 inventory.showtimeId；
- SeatKey 唯一、合法、稳定排序；
- inventory revision 为非负整数；
- 不保存 selected、recommended 或 hold 状态。

### Settings

- 缺失可选字段使用 v2 默认值；
- 非法枚举、颜色或布尔值返回 validation issue，不直接应用；
- `guest` 必须存在。

## 5. StateRepository 写入协议

```text
read + validate current
  → 比较 expectedRevision
  → clone current
  → mutate clone through use case
  → validate complete candidate
  → candidate.revision = current.revision + 1
  → candidate.updatedAt = clock.now()
  → JSON.stringify candidate
  → localStorage.setItem(state_v2, json)
  → read-back + validate
  → publish snapshot
```

- `setItem` 抛错时旧值仍是事实源，返回 STORAGE_WRITE_FAILED；
- read-back 不一致返回 STORAGE_CORRUPTED，并保留旧快照供 UI 显示只读错误态；
- 同一标签页写入串行化；
- 多标签页优先使用 Web Locks API 包围 read/compare/write；不可用时使用 revision + BroadcastChannel/storage event 检测冲突并重试；
- 冲突重试必须重新执行库存和权限校验，不能直接覆盖。

## 6. CheckoutIntent

SessionStorage key `smartcinema_checkout_v2` 保存 `DOMAIN_CONTRACTS.md` 定义的对象。

额外规则：

- 解析失败立即清除并返回 CHECKOUT_NOT_FOUND；
- schemaVersion 不匹配返回 MIGRATION_REQUIRED；
- 用户登出/切换后清除；
- consumed intent 可保留至跳转完成，用于重复 click 返回同一订单；
- 新建 intent 覆盖旧 intent 前必须显式取消旧结算。

## 7. v1 输入

迁移器只读取以下 legacy keys：

| Key | v1 内容 |
| --- | --- |
| `smartcinema_users` | 用户数组 |
| `smartcinema_session` | username/role/loginTime |
| `smartcinema_orders` | 无稳定 userId/showtimeId 的订单数组 |
| `smartcinema_sold_seats` | `{ [hallType]: seatKey[] }`，无日期 |
| `smartcinema_seat_selection` | 无可靠 showtime 的 UI 暂态 |
| `smartcinema_settings` | 部分设置 |
| `smartcinema_order_summary` | SessionStorage 跨页摘要 |

任何其他 `smartcinema_` key 记录为 warning，不自动执行或合并。

## 8. v1 → v2 迁移

### 8.1 备份

将每个 legacy key 的原始字符串（包括 null）和备份时间写入：

```js
{
    backupVersion: 1,
    createdAt: '...',
    localStorage: { key: rawStringOrNull },
    sessionStorage: { key: rawStringOrNull }
}
```

如果备份写入失败，停止迁移，不创建 v2 状态。

### 8.2 用户与会话

- 合法用户保留 id；缺 id 才生成；
- username 冲突的后续记录进入 quarantine；
- credential 标记 `demo-plaintext`；
- session 通过 username 精确匹配 userId；匹配失败则 session = null 并记录 warning；
- 确保至少一个合法 admin；仅在不存在 admin 时创建默认 demo admin。

### 8.3 订单

v1 订单缺少可靠 userId 或 dayIndex 时不得进入 `ordersById`：

- userInfo.email 能唯一匹配用户时得到候选 owner；否则再尝试唯一 name；
- hallType + 合法 dayIndex 能构造 canonical showtime；
- 只有 owner 和 showtime 都可靠、座位/金额/状态都通过校验时才迁为 active order；
- 其余原始订单写入 migration report 的 `quarantinedOrders`，只读展示，不允许自动取消、退款或改库存；
- 不用当前登录用户、默认日期或第一个同名用户猜测归属。

### 8.4 已售库存

`smartcinema_sold_seats` 没有日期，不能映射到 canonical showtime：

- 不复制到一周所有日期；
- 不假设默认周四；
- 原始 hall/seatKeys 写入 `legacyUnscopedSoldSeatsByHall` quarantine；
- 只有能够由已成功迁移订单的 canonical showtime 推导出的座位才进入 active inventory；
- report 明确告知有多少 legacy seat 无法定位。

### 8.5 设置与临时状态

- darkMode → theme dark/light；
- accessibilityMode、colorblindMode、voiceEnabled、realtimeEnabled、accentColor、language 逐项校验；
- 缺失字段使用默认值；
- v1 seat_selection 无可靠 showtime，作为临时 UI 状态丢弃并记录 warning；
- 有合法 session order summary 时可迁成 CheckoutIntent，但必须补齐 userId、showtimeId、idempotencyKey 和有效期；任一缺失则清除。

### 8.6 候选验证与提交

1. 在内存中构建完整 v2 candidate；
2. 写 `smartcinema_state_v2_candidate`；
3. 读回并运行完整 validator；
4. 写正式 `smartcinema_state_v2`；
5. 再次读回验证；
6. 写 migration report；
7. 删除 candidate；
8. 保留 v1 keys 和 backup，应用从此只写 v2。

只有阶段 8 审计且用户数据导出验证后，才考虑清理 legacy keys。

## 9. 损坏与恢复

| 场景 | 行为 |
| --- | --- |
| v2 JSON 解析失败 | 不覆盖；尝试读取备份；进入只读恢复界面 |
| v2 validation 失败 | 返回 issues；禁止订单/库存写入 |
| migration 某 key 损坏 | 隔离该 key，迁移其余合法数据并记录 warning；关键用户状态损坏则停止 |
| quota/write 失败 | 保持旧 state；UI 恢复操作前状态并提示导出/清理 |
| revision 冲突 | 重读、重新校验、有限次数重试 |
| checkout 损坏/过期 | 清除 intent，返回首页重新结算，不创建订单 |
| quarantine 非空 | 显示迁移报告；只有管理员可导出或显式处理 |

恢复 UI 不得把损坏对象直接插入 innerHTML；所有报告内容使用 textContent。

## 10. 导入与导出

导出格式：

```js
{
    exportFormat: 'smartcinema-backup',
    exportVersion: 2,
    exportedAt: '...',
    state: { /* validated state envelope */ },
    migrationReport: { /* optional */ }
}
```

- 默认不导出当前 session 和 CheckoutIntent；
- credential 默认剔除；如要完整 demo 备份必须二次确认并明确风险；
- 导入先校验到 candidate，不直接覆盖当前 state；
- 覆盖前自动创建当前 v2 backup；
- 禁止合并两个可写事实源，v2 导入采用明确“替换”语义。

## 11. 必需测试 fixture

- 空白安装创建 v2 默认状态；
- 完整合法 v1 数据迁移；
- v1 用户重复、session 不存在用户；
- v1 订单 owner 唯一匹配与无法匹配；
- v1 sold seats 无 day 进入 quarantine；
- v1 设置缺字段/非法 accent；
- v2 JSON 损坏、字段缺失、总价错误、重复 seat/idempotencyKey；
- 写入失败保持旧 revision；
- 两个 repository 实例产生 revision conflict；
- ConfirmCheckout 在一个 update 中同时写订单与 inventory；
- 重复 idempotencyKey 返回同一订单。
