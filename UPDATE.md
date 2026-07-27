# Codex 更新任务 Prompt：AI 选座目标向量匹配重构

你现在需要重构 SmartCinema 项目中的“AI 观影问答式顾问”推荐算法。请先阅读当前代码结构，尤其关注 `AiSeatAdvisor.js`、`RecommendSeatBlock.js`、`SeatExperienceScoring.js`、`SeatDecisionGuide.js`、`CommercialBookingService.js`、`commercial.js`、`scripts/server.js` 和第 2 步选座 UI，再开始修改。

## 背景问题

当前 AI 顾问使用六个“好坏分数”做加权求和，例如 `distance` 表示通用舒适银幕距离。这个语义会导致逻辑漏洞：用户说“近视，想坐近一点”时，提高 `distance` 权重反而会强化通用舒适距离，而不是靠前目标。AI 顾问需要从“好坏评分排序”改为“客观座位向量与 LLM 目标向量的加权欧式距离匹配”。

注意：不要触碰与 AI 智能选座无关的原始座位体验评分展示和原“帮我选连座”逻辑。原有 `SeatDecisionGuide` 的四/六维体验提示可以继续保持好坏分数语义；本次只重构 AI 顾问使用的推荐评分层。

## 总体目标

AI 顾问仍然只负责理解自然语言并输出结构化意图；本地代码仍负责候选座位生成、库存过滤、票数匹配、连座、同区块、无障碍确认、孤座规避和最终校验。

将 AI 推荐改为：

1. 本地为每个候选连续座位块计算一组客观 AI 座位向量。
2. DeepSeek 或 fallback 将用户偏好解析为目标向量 `targets` 与重要性权重 `weights`。
3. 本地用加权欧式距离计算候选向量与目标向量的匹配程度。
4. 选择距离最近且通过本地业务规则的候选座位块。

推荐公式建议：

```js
distance = Math.sqrt(sum(weight_i * ((candidate_i - target_i) / 100) ** 2))
score = Math.round(100 - distance * 100)
```

`weights` 必须归一化。`targets` 与候选向量各维度均使用 0-100 的同一客观量纲。

## AI 专用客观维度

新增 AI 顾问专用维度，不复用通用体验“好坏分数”语义。建议维度如下，可按现有数据结构做小幅命名调整，但必须保持“客观值 + 目标值”的设计：

- `screenDistance`：0 = 第一排，100 = 最后一排。
- `centerAlignment`：0 = 水平边缘，100 = 水平正中。
- `surroundingSpace`：0 = 周边拥挤，100 = 周边空位多。
- `priceLevel`：0 = 无座位附加费，100 = 当前价格策略中的最高座位附加费。
- `quietness`：0 = 被打扰风险高，100 = 被打扰风险低；参考过往座位使用率与当前邻域占用，不代表真实分贝。
- `egressEase`：0 = 进出不便，100 = 进出方便；可由靠过道、无台阶、偏入口/后排友好等本地元数据推导。

多人连座候选的向量值取候选座位块内座位的平均值；必要时可对区块级特征做合理聚合。

## LLM 意图输出更新

更新 `AiSeatAdvisor.js` 中的 DeepSeek prompt 和 `docs/ai-seat-advisor-skill.md`：

- LLM 不再输出“某维度越高越好”的优先级。
- LLM 输出 `targets`：用户理想座位向量，每项 0-100。
- LLM 输出 `weights`：每项重要性，0-1，后端本地归一化。
- LLM 输出固定候选集合内的 `preferenceTags`，数量可变；未知 tag 不应原样展示。
- LLM 输出 `tradeoffs`，用于解释目标之间的冲突。
- LLM 不直接输出座位号，不承诺真实分贝、真实人流或真实出口距离。

建议 JSON：

```json
{
  "summary": "一句话概括识别到的偏好",
  "targets": {
    "screenDistance": 25,
    "centerAlignment": 70,
    "surroundingSpace": 80,
    "priceLevel": 20,
    "quietness": 85,
    "egressEase": 60
  },
  "weights": {
    "screenDistance": 0.8,
    "centerAlignment": 0.4,
    "surroundingSpace": 0.5,
    "priceLevel": 0.2,
    "quietness": 0.9,
    "egressEase": 0.3
  },
  "preferenceTags": ["quiet", "near-screen"],
  "constraints": {
    "avoidFront": false,
    "preferBack": false,
    "preferAisle": false,
    "preferStepFree": false,
    "budgetSensitive": false
  },
  "tradeoffs": ["靠前会牺牲一部分后排宽松感"],
  "needsClarification": false,
  "clarificationQuestion": ""
}
```

代表性解析方向：

- “我们非常近视”：`screenDistance` 目标低，`screenDistance` 权重高。
- “不要太靠前”：`screenDistance` 目标中后，权重较高。
- “看得清楚、正中”：`centerAlignment` 目标高，可按语境调整 `screenDistance`。
- “想安静少打扰”：`quietness` 目标高，`surroundingSpace` 目标偏高。
- “带小孩，方便出去”：`egressEase` 目标高，可能提高 `quietness`，可设置 `preferAisle`。
- “便宜点，不要加价”：`priceLevel` 目标低，`priceLevel` 权重高。

## Fallback 更新

本地 fallback 也必须输出同样的 `targets` + `weights` 结构，不再输出旧的 `priorities`。可以保留少量代表性规则，但不要做庞大关键词表。

必须覆盖：

- 近视 / 想近一点。
- 不要太靠前。
- 靠中间 / 视野清楚。
- 安静 / 少打扰 / 周围空一点。
- 方便出去 / 靠过道 / 带小孩 / 老人。
- 便宜 / 性价比 / 不想加价。

## 推荐算法更新

在 AI 推荐路径中：

1. 生成候选连续座位块。
2. 保留现有库存、票数、同区块、无障碍、孤座等校验。
3. 为候选座位块计算 AI 客观向量。
4. 计算候选向量与 LLM 目标向量的加权欧式距离。
5. 可保留少量硬约束调整或过滤，例如明确要求无台阶时优先/过滤无台阶候选；但主要匹配必须来自目标向量距离。
6. 返回推荐座位、候选向量、目标向量、权重、匹配分、识别到的标签和取舍说明。

不要再按“六维好坏分数加权求和”排序 AI 候选。

## UI 更新

AI 顾问结果区应展示：

- 推荐座位。
- 识别出的偏好标签。
- 简洁推荐理由。
- 每个 AI 维度的 `当前值 / 目标值 / 权重`，例如：`银幕距离 22 / 目标 25 / 权重 35%`。
- 匹配分或距离说明。

推荐理由应基于候选向量、目标向量和权重生成，不要写“某项得分最高所以最好”这种旧语义。`quietness` 文案使用“过往座位使用率与当前邻域占用”，不要出现“演示经验模型”。

## DeepSeek 与 fallback 行为

保留当前轻量 server 代理策略：

- 前端只请求本地 server。
- API Key 只从 `.env` 或 `process.env` 读取。
- 前端、HTML、localStorage 不得出现 API Key。
- 无 Key、超时、失败或格式异常时自动 fallback。
- 保留或完善成功/失败日志，便于判断当前请求是否真实使用 DeepSeek。

## 验收要求

完成后至少验证：

- 原“帮我选连座”仍可用，不受 AI 目标向量重构影响。
- AI 顾问在 DeepSeek 成功时返回并使用 `targets` + `weights`。
- AI 顾问在无 Key 或 API 失败时 fallback 仍可演示。
- “我们非常近视”会倾向靠前，而不是通用舒适中后排。
- “不要太靠前”会倾向中后排。
- “便宜点，不要加价”会倾向低 `priceLevel`。
- “安静少打扰”会倾向高 `quietness` 和高 `surroundingSpace`。
- 推荐结果不包含已售或 hold 座位。
- 推荐结果数量与票数一致。
- 推荐结果仍通过同区块、孤座、无障碍相关规则。
- UI 能展示每个 AI 维度的当前值、目标值、权重。
- 文案中不再出现“演示经验模型”。

## 交付说明

实现完成后请简要说明：

- 新增或修改了哪些模块。
- AI 目标向量与候选向量各维度如何定义。
- 加权欧式距离如何计算。
- DeepSeek / fallback 的输出结构。
- UI 如何解释当前值、目标值和权重。
- 已执行哪些验证。
