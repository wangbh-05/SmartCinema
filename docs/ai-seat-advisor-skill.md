# AI 观影问答式顾问意图解析说明

SmartCinema 的 AI 顾问只负责理解观影偏好并输出结构化意图，不直接决定座位号。最终候选座位、库存过滤、票数匹配、连座、同区块、无障碍确认和孤座规避都由本地代码完成。

## 解析目标

- 识别用户自然语言里的显式偏好与隐含偏好。
- 将偏好转换为 AI 专用目标座位向量 `targets` 与重要性 `weights`。
- 不输出“某项越高越好”的通用好坏评分权重。
- 对模糊表达给出可执行默认，例如“舒服一点”按均衡目标向量处理。
- 对冲突表达给出取舍，例如“最中间”和“最方便出去”通常无法同时最优。
- 不确定时优先返回可执行默认，只有完全无法推荐时才要求澄清。

## AI 客观维度

所有维度均为 0-100 的客观量，用于和 LLM 给出的目标向量做加权欧式距离匹配。

- `screenDistance`：0 = 第一排，100 = 最后一排。
- `centerAlignment`：0 = 水平边缘，100 = 水平正中。
- `surroundingSpace`：0 = 周边拥挤，100 = 周边空位多。
- `priceLevel`：0 = 无座位附加费，100 = 当前价格策略中的最高座位附加费。
- `quietness`：0 = 被打扰风险高，100 = 被打扰风险低；参考过往座位使用率与当前邻域占用，不代表真实分贝。
- `egressEase`：0 = 进出不便，100 = 进出方便。

## 输出格式

`preferenceTags` 从固定候选集中选择，数量按需要返回：`quiet`、`spacious`、`convenient`、`aisle`、`step-free`、`view`、`near-screen`、`distance`、`center`、`not-center`、`not-front`、`back`、`value`。

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

## 代表性例子

- “我们非常近视”：`screenDistance` 目标低，`screenDistance` 权重高。
- “不要太靠前”：`screenDistance` 目标中后，权重较高。
- “看得清楚、正中”：`centerAlignment` 目标高，可按语境调整 `screenDistance`。
- “想安静少打扰”：`quietness` 目标高，`surroundingSpace` 目标偏高。
- “带小孩，方便出去”：`egressEase` 目标高，可设置 `preferAisle=true`。
- “便宜点，不要加价”：`priceLevel` 目标低，`priceLevel` 权重高。

这些例子只说明解析方向，不应扩展成穷举关键词规则库。
