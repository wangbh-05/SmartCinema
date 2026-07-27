import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { deepFreeze } from '../../shared/objects.js';
import {
    createSeatPopularityMapFromExperience,
    DEFAULT_EXPERIENCE_WEIGHTS,
    evaluateSeatBlockExperience
} from './SeatExperienceScoring.js';

export function evaluateSeatDecision({ auditorium, seatIds, inventory, pricingPolicy }) {
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
        throw new ValidationError('座位体验评估至少需要一个座位');
    }
    const seats = seatIds.map(seatId => {
        const seat = findAuditoriumSeat(auditorium, seatId);
        if (!seat) throw new ValidationError('座位体验评估引用未知座位', { seatId });
        return seat;
    });
    const experience = evaluateSeatBlockExperience({
        auditorium,
        seats,
        inventory,
        pricingPolicy,
        weights: DEFAULT_EXPERIENCE_WEIGHTS
    });
    const dimensions = experience.dimensions;
    const score = experience.score;
    const grade = score >= 88 ? '极佳' : (score >= 75 ? '优秀' : (score >= 60 ? '舒适' : '基础'));
    const strongest = [...dimensions].sort((left, right) => right.score - left.score)[0];
    const weakest = [...dimensions].sort((left, right) => left.score - right.score)[0];
    const summary = weakest.score < 65 ?
        `${strongest.label}表现较好；${weakest.label}相对普通，可按偏好调整。` :
        `${strongest.label}突出，各项体验较均衡。`;

    return deepFreeze({
        score,
        grade,
        summary: `${summary} 安静程度参考过往座位使用率，不代表真实分贝。`,
        dimensions
    });
}

export function createSeatPopularityMap({ auditorium, inventory }) {
    return deepFreeze(createSeatPopularityMapFromExperience({ auditorium, inventory }));
}
