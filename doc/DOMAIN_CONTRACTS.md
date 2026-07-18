# SmartCinema 领域契约

> 状态：Accepted for implementation
> 版本：2.0
> 日期：2026-07-18

## 1. 基础标识

### HallType

允许值：`small`、`medium`、`large`。影厅尺寸仍由 Hall catalog 提供，持久化对象不重复保存可推导的 rows/cols/total。

### DayIndex

整数 `0..6`，周一为 0，周日为 6。任何 `parseInt` 结果都必须在进入领域前校验，不能用 `|| 3` 把合法的 0 错改为周四。

### ShowtimeId

v2 canonical 格式：

```text
<hallType>:day:<dayIndex>
```

示例：`medium:day:3`。创建与解析只能通过 `createShowtimeId(hallType, dayIndex)` 和 `parseShowtimeId(id)`，UI 不拼接字符串。

v2 尚无电影、具体时刻或影厅实例 ID；未来增加这些维度必须升级 schema version，不能改变现有 ID 的含义。

### SeatKey

格式：`<zeroBasedRow>-<zeroBasedCol>`，例如 `5-8`。解析后必须结合 Hall catalog 校验范围。持久化与比较使用 SeatKey，展示层才转换为“6排9座”。

### UserId、OrderId、CheckoutIntentId、IdempotencyKey

- 都是 opaque string，业务代码不解析其中含义；
- 迁移时保留现有 `user.id`；
- 新 ID 由 IdGenerator 端口生成；
- IdempotencyKey 在一次结算意图内稳定，不能在每次 click 时重新生成。

## 2. SeatInventory

```js
{
    showtimeId: 'medium:day:3',
    revision: 4,
    soldSeatKeys: ['5-8', '5-9'],
    updatedAt: '2026-07-18T00:00:00.000Z'
}
```

不变量：

- `showtimeId` 必须 canonical；
- `soldSeatKeys` 唯一、合法且按稳定顺序序列化；
- revision 是非负整数；
- sold 不包含 local selection、recommendation 或 remote hold；
- 售出多个座位是全有或全无操作；任一不可售则整个确认失败。

领域操作：

- `sell(inventory, seatKeys)`；
- `release(inventory, seatKeys)`；
- `areAvailable(inventory, seatKeys)`。

## 3. LocalSelection

```js
{
    showtimeId: 'medium:day:3',
    seatKeys: ['5-8', '5-9'],
    updatedAt: '2026-07-18T00:00:00.000Z'
}
```

不变量：

- 只属于当前 AppState，不写入持久库存；
- 所有座位属于同一 showtime；
- 不得包含 sold 或 remote-held 座位；
- 切换 showtime 时必须清空或经过显式确认，不能自动搬运；
- selection 变化使推荐确认态和所有评分结果失效。

## 4. RemoteHold

```js
{
    id: 'hold-1',
    showtimeId: 'medium:day:3',
    seatKey: '5-8',
    ownerLabel: '观众 A',
    expiresAt: '2026-07-18T00:00:20.000Z'
}
```

不变量：

- 存在于独立 `remoteHoldsBySeatKey` Map；
- 不修改 LocalSelection 或 `Seat.isSelected`；
- 过期、release 或 purchase 事件必须移除 hold；
- purchase 事件通过库存命令转为 sold，不直接改 Canvas model；
- 当前用户已选座收到远端冲突时，用例返回冲突并让 UI 明确提示。

## 5. User

```js
{
    id: 'user_123',
    username: 'alice',
    credential: {
        kind: 'demo-plaintext',
        value: '...'
    },
    name: 'Alice',
    email: 'alice@example.test',
    role: 'member',
    createdAt: '2026-07-18T00:00:00.000Z'
}
```

角色仅允许 `member`、`admin`、内部迁移用 `system`。这是纯前端演示数据，`demo-plaintext` 不能被描述为安全认证；未来接入后端时 credential 不得继续保存在浏览器。

权限：

- member 只能读取、确认、取消和获取自己的订单/收据；
- admin 可以读取统计与用户列表，但删除用户不能删除 admin/system；
- 未登录用户不能创建 CheckoutIntent、查看历史订单或变更订单；
- UI 隐藏按钮不是权限检查，Application use case 必须再次检查。

## 6. Order

```js
{
    id: 'ord_123',
    idempotencyKey: 'checkout_123',
    userId: 'user_123',
    showtimeId: 'medium:day:3',
    seats: [
        { seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }
    ],
    totalPrice: 120,
    currency: 'CNY',
    status: 'confirmed',
    createdAt: '2026-07-18T00:00:00.000Z',
    confirmedAt: '2026-07-18T00:00:00.000Z',
    cancelledAt: null,
    cancelReason: null,
    refund: null
}
```

不变量：

- `userId`、canonical `showtimeId`、`idempotencyKey` 必填；
- 一个 idempotencyKey 最多对应一个订单；
- seats 非空且 SeatKey 唯一；
- `totalPrice` 必须由 `unitPrice` 求和重新验证，不能信任 UI；
- 金额使用非负整数元，currency 固定 `CNY`；
- 订单座位和库存 showtime 必须一致；
- created/confirmed/cancelled 时间按状态存在。

### 状态机

| 当前状态 | 操作 | 下一状态 | 说明 |
| --- | --- | --- | --- |
| 无 | ConfirmCheckout | confirmed | 本地模拟支付直接确认；同时售出库存 |
| confirmed | CancelOrder | cancelled | 同时释放同一场次库存并记录 refund |
| cancelled | Confirm/Cancel | 不变 | 返回 `ORDER_ALREADY_CANCELLED`，不得重复改库存 |

v2 不再先持久化 pending 再立即确认；CheckoutIntent 表达支付前状态。若未来接入异步支付，再通过 schema v3 引入 pending/failed。

## 7. CheckoutIntent

```js
{
    schemaVersion: 2,
    id: 'checkout_123',
    idempotencyKey: 'checkout_123',
    userId: 'user_123',
    showtimeId: 'medium:day:3',
    seats: [
        { seatKey: '5-8', row: 5, col: 8, unitPrice: 120 }
    ],
    totalPrice: 120,
    inventoryRevision: 4,
    state: 'pending',
    createdAt: '2026-07-18T00:00:00.000Z',
    expiresAt: '2026-07-18T00:15:00.000Z',
    consumedOrderId: null
}
```

- 由 StartCheckout 创建并写 SessionStorage；
- 必须属于当前 user 和 showtime；
- ConfirmCheckout 成功后变为 consumed，并记录同一订单 ID；
- 重复确认 consumed intent 返回已有订单；
- 过期、用户切换或取消时清除；
- 价格和库存 revision 在确认时重新验证。

## 8. Settings

```js
{
    theme: 'dark',
    accessibilityMode: false,
    colorblindMode: false,
    voiceEnabled: false,
    realtimeEnabled: false,
    accentColor: '#58A6FF',
    reducedMotion: 'system',
    language: 'zh-CN'
}
```

- `theme`：`light | dark | system`；
- `reducedMotion`：`system | reduce | no-preference`；
- accentColor 必须是六位十六进制颜色；
- 用户登录时使用用户设置；未登录使用 `guest` 设置；
- 保存成功后才更新 AppState，失败时 UI 恢复原值并提示。

## 9. AppState

```js
{
    revision: 12,
    session: { userId: 'user_123', role: 'member' },
    showtimeId: 'medium:day:3',
    inventory: { /* readonly SeatInventory */ },
    selection: { /* readonly LocalSelection */ },
    remoteHoldsBySeatKey: new Map(),
    recommendation: null,
    systemScore: null,
    manualScore: null,
    combinedScore: null,
    settings: { /* readonly Settings */ }
}
```

AppState 对 UI 只读。任何输入变化通过 command 产生新快照；UI 不原地修改实体或集合。

派生失效：

| 输入变化 | 必须失效/重算 |
| --- | --- |
| showtimeId | inventory、selection、holds、recommendation、全部评分 |
| inventory | 冲突 selection、recommendation、全部评分 |
| selection | recommendation 确认态、systemScore、combinedScore |
| manualScore | combinedScore |
| settings | 相应 render model，不改业务数据 |

## 10. 错误码

| Code | 含义 |
| --- | --- |
| VALIDATION_ERROR | 输入结构或值无效 |
| AUTH_REQUIRED | 未登录 |
| FORBIDDEN | 用户无权访问该资源 |
| USERNAME_TAKEN | 用户名已存在 |
| INVALID_CREDENTIALS | 登录信息不匹配 |
| SHOWTIME_NOT_FOUND | 场次无效 |
| SEAT_UNAVAILABLE | 一个或多个座位已售/被占 |
| SELECTION_EMPTY | 未选择座位 |
| CHECKOUT_NOT_FOUND | 结算意图不存在 |
| CHECKOUT_EXPIRED | 结算意图过期 |
| CHECKOUT_OWNER_MISMATCH | 结算意图与当前用户不一致 |
| ORDER_NOT_FOUND | 订单不存在 |
| ORDER_ALREADY_CANCELLED | 订单已经取消 |
| STATE_CONFLICT | repository revision 冲突 |
| STORAGE_CORRUPTED | 持久化数据校验失败 |
| STORAGE_WRITE_FAILED | 持久化写入失败 |
| MIGRATION_REQUIRED | v1 数据需要迁移/人工处理 |

UI 文案可以本地化，但 code 和 details 是测试与控制流的稳定契约。
