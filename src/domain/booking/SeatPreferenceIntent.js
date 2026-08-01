export const SEAT_PREFERENCE_DIMENSIONS = Object.freeze({
    screenDistance: '银幕距离',
    centerAlignment: '居中程度',
    surroundingSpace: '周边空位',
    priceLevel: '价格水平',
    lowDisturbance: '少受打扰',
    egressEase: '进出便捷'
});

export const DEFAULT_SEAT_PREFERENCE_TARGETS = Object.freeze({
    screenDistance: 58,
    centerAlignment: 75,
    surroundingSpace: 70,
    priceLevel: 15,
    lowDisturbance: 70,
    egressEase: 45
});

export const DEFAULT_SEAT_PREFERENCE_WEIGHTS = Object.freeze({
    screenDistance: 0.2,
    centerAlignment: 0.2,
    surroundingSpace: 0.16,
    priceLevel: 0.12,
    lowDisturbance: 0.2,
    egressEase: 0.12
});

const DIMENSION_IDS = Object.freeze(Object.keys(SEAT_PREFERENCE_DIMENSIONS));
const TAG_LABELS = Object.freeze({
    quiet: '少受打扰',
    spacious: '周边更宽松',
    convenient: '进出方便',
    aisle: '靠近过道',
    'step-free': '无台阶友好',
    view: '视野清楚',
    'near-screen': '靠近银幕',
    center: '偏中间',
    'not-center': '避开正中',
    'not-front': '避开前排',
    back: '偏后排',
    value: '控制加价'
});
const ALLOWED_TAGS = new Set(Object.keys(TAG_LABELS));

function clamp(value, minimum = 0, maximum = 100) {
    return Math.min(maximum, Math.max(minimum, value));
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

export function normalizeSeatPreferenceTargets(input = {}) {
    const targets = {};
    DIMENSION_IDS.forEach(id => {
        const value = Number(input[id]);
        targets[id] = Number.isFinite(value) ? Math.round(clamp(value)) :
            DEFAULT_SEAT_PREFERENCE_TARGETS[id];
    });
    return Object.freeze(targets);
}

export function normalizeSeatPreferenceWeights(input = {}) {
    const weights = {};
    let total = 0;
    DIMENSION_IDS.forEach(id => {
        const value = Number(input[id]);
        weights[id] = Number.isFinite(value) && value > 0 ? value : 0;
        total += weights[id];
    });
    if (total <= 0) return DEFAULT_SEAT_PREFERENCE_WEIGHTS;
    DIMENSION_IDS.forEach(id => {
        weights[id] /= total;
    });
    return Object.freeze(weights);
}

export function normalizeSeatPreferenceIntent(input = {}) {
    const preferenceTags = unique(Array.isArray(input.preferenceTags) ? input.preferenceTags : [])
        .map(tag => String(tag || '').trim().toLowerCase())
        .filter(tag => ALLOWED_TAGS.has(tag))
        .slice(0, 6);
    const tradeoffs = unique(Array.isArray(input.tradeoffs) ? input.tradeoffs : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .slice(0, 2);
    const constraints = input.constraints && typeof input.constraints === 'object' ? input.constraints : {};
    return Object.freeze({
        summary: typeof input.summary === 'string' && input.summary.trim() ?
            input.summary.trim() : '已按均衡观影体验理解偏好',
        targets: normalizeSeatPreferenceTargets(input.targets),
        weights: normalizeSeatPreferenceWeights(input.weights),
        preferenceTags: Object.freeze(preferenceTags),
        constraints: Object.freeze({
            avoidFront: Boolean(constraints.avoidFront),
            preferBack: Boolean(constraints.preferBack),
            preferAisle: Boolean(constraints.preferAisle),
            preferStepFree: Boolean(constraints.preferStepFree),
            budgetSensitive: Boolean(constraints.budgetSensitive)
        }),
        tradeoffs: Object.freeze(tradeoffs),
        needsClarification: Boolean(input.needsClarification),
        clarificationQuestion: typeof input.clarificationQuestion === 'string' ?
            input.clarificationQuestion.trim() : ''
    });
}

export function seatPreferenceLabels(intent = {}) {
    return normalizeSeatPreferenceIntent(intent).preferenceTags
        .map(tag => TAG_LABELS[tag])
        .filter(Boolean)
        .slice(0, 3);
}
