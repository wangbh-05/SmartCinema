import { normalizeSeatPreferenceIntent } from '../../domain/booking/SeatPreferenceIntent.js';

function hasAny(text, patterns) {
    return patterns.some(pattern => pattern.test(text));
}

export function interpretSeatPreferenceLocally(text = '', context = {}) {
    const normalizedText = String(text || '').trim().toLowerCase();
    const targets = {
        screenDistance: 58,
        centerAlignment: 75,
        surroundingSpace: 70,
        priceLevel: 15,
        lowDisturbance: 70,
        egressEase: 45
    };
    const weights = {
        screenDistance: 0.36,
        centerAlignment: 0.34,
        surroundingSpace: 0.26,
        priceLevel: 0.18,
        lowDisturbance: 0.24,
        egressEase: 0.2
    };
    const tags = [];
    const tradeoffs = [];
    const constraints = {
        avoidFront: false,
        preferBack: false,
        preferAisle: false,
        preferStepFree: false,
        budgetSensitive: false
    };

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
        targets.lowDisturbance = 90;
        targets.surroundingSpace = 86;
        weights.lowDisturbance = 0.9;
        weights.surroundingSpace = 0.72;
        tags.push('quiet', 'spacious');
    }
    if (hasAny(normalizedText, [/方便.*(出|走|离场|厕所)/, /出去方便/, /靠过道/, /过道/, /带小孩/, /孩子/, /老人/, /长者/, /怕影响别人/, /不想影响/])) {
        targets.egressEase = 92;
        weights.egressEase = 0.9;
        targets.lowDisturbance = Math.max(targets.lowDisturbance, 72);
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
    if ((tags.includes('center') || tags.includes('view')) &&
        (constraints.preferAisle || tags.includes('convenient'))) {
        tradeoffs.push('正中位置与进出便捷可能冲突，推荐时会按目标权重折中。');
    }
    if (constraints.budgetSensitive && (tags.includes('view') || tags.includes('center'))) {
        tradeoffs.push('控制加价可能会牺牲少量中心区优势。');
    }

    return normalizeSeatPreferenceIntent({
        summary: tags.length > 0 ? '已识别偏好并转换为目标座位向量' : '偏好较宽泛，将按均衡目标向量推荐',
        targets,
        weights,
        preferenceTags: tags.length > 0 ? tags : ['view'],
        constraints,
        tradeoffs,
        needsClarification: false,
        clarificationQuestion: ''
    });
}
