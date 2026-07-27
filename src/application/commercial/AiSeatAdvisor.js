import {
    AI_SEAT_VECTOR_DIMENSIONS,
    DEFAULT_AI_SEAT_TARGETS,
    DEFAULT_AI_SEAT_WEIGHTS,
    normalizeAiSeatTargets,
    normalizeAiSeatWeights
} from '../../domain/booking/AiSeatVectorScoring.js';

export const AI_SEAT_ADVISOR_SYSTEM_PROMPT = `
你是 SmartCinema 的 AI 观影问答式顾问。你的任务是理解用户自然语言偏好，并输出给本地推荐算法消费的结构化意图。

原则：
- 识别显式偏好和隐含偏好，例如“近视”通常意味着更靠近银幕，“带小孩”通常意味着方便进出、减少影响别人。
- 不直接输出座位号，不承诺真实噪声、真实人流或真实出口距离。
- 对模糊需求给出可执行默认，例如“舒服一点”理解为目标向量接近均衡观影体验。
- 对冲突需求给出取舍，例如“最中间”和“最方便出去”通常不能同时最优。
- 如果上下文已有票数，应尽量返回可推荐意图；只有完全无法判断偏好时才要求澄清。
- 输出必须是 JSON，便于本地算法读取。

AI 专用客观维度，全部为 0-100：
- screenDistance：0 = 第一排，100 = 最后一排。近视/想近一点时目标低；不要太靠前时目标中后。
- centerAlignment：0 = 水平边缘，100 = 水平正中。
- surroundingSpace：0 = 周边拥挤，100 = 周边空位多。
- priceLevel：0 = 无座位附加费，100 = 当前价格策略中的最高座位附加费。想便宜时目标低。
- quietness：0 = 被打扰风险高，100 = 被打扰风险低；参考过往座位使用率和当前邻域占用，不代表真实分贝。
- egressEase：0 = 进出不便，100 = 进出方便；靠过道、无台阶、便于离场会更高。

本地算法会用候选座位向量与 targets 的加权欧式距离匹配。weights 表示目标重要性，不是“分数越高越好”的权重。
preferenceTags 只能从以下候选中选择，数量按需要返回：quiet, spacious, convenient, aisle, step-free, view, near-screen, distance, center, not-center, not-front, back, value。

输出 JSON 格式：
{
  "summary": "一句话概括识别到的偏好",
  "targets": { "screenDistance": 25, "centerAlignment": 70, "surroundingSpace": 80, "priceLevel": 20, "quietness": 85, "egressEase": 60 },
  "weights": { "screenDistance": 0.8, "centerAlignment": 0.4, "surroundingSpace": 0.5, "priceLevel": 0.2, "quietness": 0.9, "egressEase": 0.3 },
  "preferenceTags": ["quiet", "near-screen"],
  "constraints": { "avoidFront": false, "preferBack": false, "preferAisle": false, "preferStepFree": false, "budgetSensitive": false },
  "tradeoffs": ["简短取舍说明"],
  "needsClarification": false,
  "clarificationQuestion": ""
}

例子：
- “我们非常近视”：screenDistance 目标低，screenDistance 权重高，可加 near-screen。
- “不要太靠前”：screenDistance 目标中后，screenDistance 权重较高，可加 not-front。
- “看得清楚、正中”：centerAlignment 目标高，可按语境调整 screenDistance。
- “想安静少打扰”：quietness 目标高，surroundingSpace 目标偏高。
- “带小孩，方便出去”：egressEase 目标高，可设置 preferAisle=true。
- “便宜点，不要加价”：priceLevel 目标低，priceLevel 权重高。
`.trim();

const DIMENSION_IDS = Object.freeze(Object.keys(AI_SEAT_VECTOR_DIMENSIONS));
const TAG_LABELS = Object.freeze({
    quiet: '安静少打扰',
    spacious: '周边不拥挤',
    convenient: '进出方便',
    aisle: '靠近过道',
    'step-free': '无台阶友好',
    view: '视野清楚',
    'near-screen': '靠近银幕',
    distance: '距离目标明确',
    center: '偏中间',
    'not-center': '避开正中',
    'not-front': '避开前排',
    back: '偏后排',
    value: '控制加价'
});
const ALLOWED_TAGS = Object.freeze(new Set(Object.keys(TAG_LABELS)));
const TAG_ALIASES = Object.freeze({
    isolated: 'spacious',
    isolation: 'spacious',
    private: 'quiet',
    privacy: 'quiet',
    'back-row': 'back',
    backrow: 'back',
    rear: 'back',
    'front-row': 'near-screen',
    near: 'near-screen',
    myopia: 'near-screen',
    'not-too-front': 'not-front',
    'avoid-front': 'not-front',
    'off-center': 'not-center',
    side: 'not-center',
    budget: 'value',
    cheap: 'value'
});

function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(1, Math.max(0, number));
}

function hasAny(text, patterns) {
    return patterns.some(pattern => pattern.test(text));
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function normalizeTag(tag) {
    const raw = String(tag || '').trim().toLowerCase();
    const normalized = TAG_ALIASES[raw] || raw;
    return ALLOWED_TAGS.has(normalized) ? normalized : null;
}

function normalizeLegacyPriorities(priorities = {}) {
    if (!priorities || typeof priorities !== 'object' || Array.isArray(priorities)) {
        return null;
    }
    const hasLegacyValues = ['view', 'distance', 'surroundings', 'value', 'quietness', 'convenience']
        .some(id => Number.isFinite(Number(priorities[id])));
    if (!hasLegacyValues) return null;
    return {
        targets: {
            screenDistance: priorities.distance >= 0.68 ? 58 : DEFAULT_AI_SEAT_TARGETS.screenDistance,
            centerAlignment: priorities.view >= 0.68 ? 88 : DEFAULT_AI_SEAT_TARGETS.centerAlignment,
            surroundingSpace: priorities.surroundings >= 0.68 ? 86 : DEFAULT_AI_SEAT_TARGETS.surroundingSpace,
            priceLevel: priorities.value >= 0.68 ? 10 : DEFAULT_AI_SEAT_TARGETS.priceLevel,
            quietness: priorities.quietness >= 0.68 ? 88 : DEFAULT_AI_SEAT_TARGETS.quietness,
            egressEase: priorities.convenience >= 0.68 ? 85 : DEFAULT_AI_SEAT_TARGETS.egressEase
        },
        weights: {
            screenDistance: clamp01(priorities.distance),
            centerAlignment: clamp01(priorities.view),
            surroundingSpace: clamp01(priorities.surroundings),
            priceLevel: clamp01(priorities.value),
            quietness: clamp01(priorities.quietness),
            egressEase: clamp01(priorities.convenience)
        }
    };
}

function normalizeConstraints(input = {}) {
    return Object.freeze({
        avoidFront: Boolean(input.avoidFront),
        preferBack: Boolean(input.preferBack),
        preferAisle: Boolean(input.preferAisle),
        preferStepFree: Boolean(input.preferStepFree),
        budgetSensitive: Boolean(input.budgetSensitive)
    });
}

export function normalizeSeatAdvisorIntent(input = {}) {
    const legacy = normalizeLegacyPriorities(input.priorities);
    const targets = normalizeAiSeatTargets(input.targets || legacy?.targets || DEFAULT_AI_SEAT_TARGETS);
    const weights = normalizeAiSeatWeights(input.weights || legacy?.weights || DEFAULT_AI_SEAT_WEIGHTS);
    const preferenceTags = unique(Array.isArray(input.preferenceTags) ? input.preferenceTags : [])
        .map(tag => normalizeTag(tag))
        .filter(Boolean)
        .slice(0, 8);
    const tradeoffs = unique(Array.isArray(input.tradeoffs) ? input.tradeoffs : [])
        .map(item => String(item).trim())
        .filter(item => item.length > 0)
        .slice(0, 3);

    return Object.freeze({
        summary: typeof input.summary === 'string' && input.summary.trim().length > 0 ?
            input.summary.trim() : '已按目标座位向量理解偏好',
        targets,
        weights,
        preferenceTags: Object.freeze(preferenceTags),
        constraints: normalizeConstraints(input.constraints || {}),
        tradeoffs: Object.freeze(tradeoffs),
        needsClarification: Boolean(input.needsClarification),
        clarificationQuestion: typeof input.clarificationQuestion === 'string' ?
            input.clarificationQuestion.trim() : ''
    });
}

export function parseSeatAdvisorIntentFallback(text = '', context = {}) {
    const normalizedText = String(text || '').trim().toLowerCase();
    const targets = { ...DEFAULT_AI_SEAT_TARGETS };
    const weights = {
        screenDistance: 0.36,
        centerAlignment: 0.34,
        surroundingSpace: 0.26,
        priceLevel: 0.18,
        quietness: 0.24,
        egressEase: 0.2
    };
    const tags = [];
    const constraints = {
        avoidFront: false,
        preferBack: false,
        preferAisle: false,
        preferStepFree: false,
        budgetSensitive: false
    };
    const tradeoffs = [];

    if (!normalizedText) {
        tags.push('view', 'distance');
    }
    if (hasAny(normalizedText, [/近视/, /看不清/, /坐近/, /近一点/, /靠前一点/, /前一点/])) {
        targets.screenDistance = 20;
        weights.screenDistance = 0.95;
        tags.push('near-screen');
        tradeoffs.push('靠近银幕会牺牲一部分后排宽松感。');
    }
    if (hasAny(normalizedText, [/不要.*靠前/, /别.*靠前/, /太靠前/, /前排/, /脖子/])) {
        targets.screenDistance = Math.max(targets.screenDistance, 62);
        weights.screenDistance = Math.max(weights.screenDistance, 0.82);
        constraints.avoidFront = true;
        tags.push('not-front');
    }
    if (hasAny(normalizedText, [/靠后/, /后排/])) {
        targets.screenDistance = 82;
        weights.screenDistance = Math.max(weights.screenDistance, 0.72);
        constraints.preferBack = true;
        tags.push('back');
    }
    if (hasAny(normalizedText, [/看得清/, /清楚/, /视野/, /沉浸/, /正中/, /中间/, /最佳/, /舒服/])) {
        targets.centerAlignment = 90;
        weights.centerAlignment = 0.82;
        tags.push('view');
        if (hasAny(normalizedText, [/正中/, /中间/])) tags.push('center');
    }
    if (hasAny(normalizedText, [/安静/, /少人/, /人少/, /别被打扰/, /不被打扰/, /清净/, /周围.*空/, /空一点/])) {
        targets.quietness = 90;
        targets.surroundingSpace = 86;
        weights.quietness = 0.9;
        weights.surroundingSpace = 0.72;
        tags.push('quiet', 'spacious');
    }
    if (hasAny(normalizedText, [/方便.*(出|走|离场|厕所)/, /出去方便/, /靠过道/, /过道/, /带小孩/, /孩子/, /老人/, /长者/, /怕影响别人/, /不想影响/])) {
        targets.egressEase = 92;
        weights.egressEase = 0.9;
        targets.quietness = Math.max(targets.quietness, 72);
        constraints.preferAisle = true;
        tags.push('convenient', 'aisle');
    }
    if (hasAny(normalizedText, [/无台阶/, /行动不便/, /轮椅/, /少走路/])) {
        targets.egressEase = 96;
        weights.egressEase = 0.96;
        constraints.preferStepFree = true;
        tags.push('step-free');
    }
    if (hasAny(normalizedText, [/便宜/, /性价比/, /加价/, /不想贵/, /预算/, /划算/])) {
        targets.priceLevel = 0;
        weights.priceLevel = 0.95;
        constraints.budgetSensitive = true;
        tags.push('value');
    }
    if (context.partyType === 'family' || hasAny(normalizedText, [/带小孩/, /孩子/, /老人/, /长者/])) {
        targets.egressEase = Math.max(targets.egressEase, 82);
        weights.egressEase = Math.max(weights.egressEase, 0.72);
        constraints.avoidFront = true;
    }
    if ((tags.includes('center') || tags.includes('view')) && (constraints.preferAisle || tags.includes('convenient'))) {
        tradeoffs.push('正中位置与进出便捷可能冲突，推荐时会按目标权重折中。');
    }
    if (constraints.budgetSensitive && (tags.includes('view') || tags.includes('center'))) {
        tradeoffs.push('控制加价可能会牺牲少量中心区优势。');
    }

    return normalizeSeatAdvisorIntent({
        summary: tags.length > 0 ? '已识别偏好并转换为目标座位向量' : '偏好较宽泛，将按均衡目标向量推荐',
        targets,
        weights,
        preferenceTags: tags.length > 0 ? tags : ['view', 'distance'],
        constraints,
        tradeoffs,
        needsClarification: false,
        clarificationQuestion: ''
    });
}

export function seatAdvisorPreferenceLabels(intent = {}) {
    return normalizeSeatAdvisorIntent(intent).preferenceTags
        .map(tag => TAG_LABELS[tag])
        .filter(Boolean)
        .slice(0, 6);
}

export function dominantSeatAdvisorTargets(rows = []) {
    return [...rows]
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 3);
}
