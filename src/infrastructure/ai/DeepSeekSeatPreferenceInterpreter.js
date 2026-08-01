import { normalizeSeatPreferenceIntent } from '../../domain/booking/SeatPreferenceIntent.js';

export const SEAT_PREFERENCE_SYSTEM_PROMPT = `
你是 SmartCinema 的智能选座偏好解释器。你的任务是理解用户自然语言偏好，并输出给本地推荐算法消费的结构化意图。

原则：
- 识别显式和隐含偏好，例如“近视”意味着更靠近银幕，“带小孩”意味着方便进出。
- 不直接输出座位号，不承诺真实噪声、真实人流或真实出口距离。
- 对模糊需求给出可执行的均衡默认，对冲突需求给出取舍。
- 输出必须是 JSON；本地算法会负责库存、连座、年龄和无障碍规则。

六个目标维度均为 0-100：
- screenDistance：0 = 第一排，100 = 最后一排。
- centerAlignment：0 = 水平边缘，100 = 水平正中。
- surroundingSpace：0 = 周边拥挤，100 = 周边空位多。
- priceLevel：0 = 无座位附加费，100 = 最高附加费。
- lowDisturbance：0 = 被打扰风险高，100 = 被打扰风险低，仅依据布局与当前占用估算。
- egressEase：0 = 进出不便，100 = 进出方便。

preferenceTags 只能使用：quiet, spacious, convenient, aisle, step-free, view, near-screen, center, not-center, not-front, back, value。

输出格式：
{
  "summary": "一句话概括偏好",
  "targets": { "screenDistance": 58, "centerAlignment": 75, "surroundingSpace": 70, "priceLevel": 15, "lowDisturbance": 70, "egressEase": 45 },
  "weights": { "screenDistance": 0.2, "centerAlignment": 0.2, "surroundingSpace": 0.16, "priceLevel": 0.12, "lowDisturbance": 0.2, "egressEase": 0.12 },
  "preferenceTags": ["view"],
  "constraints": { "avoidFront": false, "preferBack": false, "preferAisle": false, "preferStepFree": false, "budgetSensitive": false },
  "tradeoffs": [],
  "needsClarification": false,
  "clarificationQuestion": ""
}
`.trim();

function extractJsonObject(text) {
    if (typeof text !== 'string') return null;
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

export async function interpretSeatPreferenceWithDeepSeek({
    preferenceText,
    context,
    apiKey = process.env.DEEPSEEK_API_KEY,
    apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
    model = process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeoutMs = 8000
}) {
    if (!apiKey) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SEAT_PREFERENCE_SYSTEM_PROMPT },
                    { role: 'user', content: JSON.stringify({ preferenceText, context }) }
                ],
                temperature: 0.2
            })
        });
        if (!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
        const payload = await response.json();
        const parsed = extractJsonObject(payload?.choices?.[0]?.message?.content);
        if (!parsed) throw new Error('AI_PROVIDER_INVALID_RESPONSE');
        return normalizeSeatPreferenceIntent(parsed);
    } finally {
        clearTimeout(timeout);
    }
}
