import { findAuditoriumSeat } from '../catalog/Auditorium.js';
import { getUnavailableSeatIds } from './ShowtimeInventory.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { deepFreeze } from '../../shared/objects.js';

function clamp(value, minimum = 0, maximum = 100) {
    return Math.min(maximum, Math.max(minimum, value));
}

function layoutMetrics(auditorium) {
    return {
        maxRowIndex: Math.max(...auditorium.seats.map(seat => seat.rowIndex), 1),
        maxColumnIndex: Math.max(...auditorium.seats.map(seat => seat.columnIndex), 1)
    };
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function localUnavailableRatio(seat, auditorium, unavailable, selected = new Set()) {
    const neighbours = auditorium.seats.filter(candidate =>
        candidate.rowIndex === seat.rowIndex &&
        candidate.sectionId === seat.sectionId &&
        candidate.id !== seat.id &&
        Math.abs(candidate.columnIndex - seat.columnIndex) <= 2
    );
    if (neighbours.length === 0) return 0;
    const unavailableCount = neighbours.filter(candidate =>
        unavailable.has(candidate.id) && !selected.has(candidate.id)
    ).length;
    return unavailableCount / neighbours.length;
}

function dimension(id, label, score) {
    return Object.freeze({ id, label, score: Math.round(clamp(score)) });
}

export function evaluateSeatDecision({ auditorium, seatIds, inventory, pricingPolicy }) {
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
        throw new ValidationError('座位体验评估至少需要一个座位');
    }
    const seats = seatIds.map(seatId => {
        const seat = findAuditoriumSeat(auditorium, seatId);
        if (!seat) throw new ValidationError('座位体验评估引用未知座位', { seatId });
        return seat;
    });
    const selected = new Set(seatIds);
    const unavailable = getUnavailableSeatIds(inventory);
    const { maxRowIndex, maxColumnIndex } = layoutMetrics(auditorium);
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const averageColumn = average(seats.map(seat => seat.columnIndex));
    const horizontalCenter = maxColumnIndex / 2;
    const sweetSpotRow = maxRowIndex * 0.58;
    const horizontalDistance = Math.abs(averageColumn - horizontalCenter) / Math.max(horizontalCenter, 1);
    const rowDistance = Math.abs(averageRow - sweetSpotRow) / Math.max(maxRowIndex, 1);
    const crowding = average(seats.map(seat =>
        localUnavailableRatio(seat, auditorium, unavailable, selected)
    ));
    const maximumSurcharge = Math.max(
        ...Object.values(pricingPolicy.seatZoneSurcharges),
        0
    );
    const averageSurcharge = average(seats.map(seat =>
        pricingPolicy.seatZoneSurcharges[seat.zoneId] || 0
    ));

    const dimensions = Object.freeze([
        dimension('view', '视野角度', 100 - horizontalDistance * 72),
        dimension('distance', '银幕距离', 100 - rowDistance * 150),
        dimension('surroundings', '周边空位', 100 - crowding * 58),
        dimension('value', '价格平衡', maximumSurcharge === 0 ? 100 : 100 - averageSurcharge / maximumSurcharge * 24)
    ]);
    const weights = { view: 0.35, distance: 0.3, surroundings: 0.2, value: 0.15 };
    const score = Math.round(dimensions.reduce((total, item) => total + item.score * weights[item.id], 0));
    const grade = score >= 88 ? '极佳' : (score >= 75 ? '优秀' : (score >= 60 ? '舒适' : '基础'));
    const strongest = [...dimensions].sort((left, right) => right.score - left.score)[0];
    const weakest = [...dimensions].sort((left, right) => left.score - right.score)[0];
    const summary = weakest.score < 65 ?
        `${strongest.label}表现较好；${weakest.label}相对普通，可按偏好调整。` :
        `${strongest.label}突出，各项体验较均衡。`;

    return deepFreeze({ score, grade, summary, dimensions });
}

export function createSeatPopularityMap({ auditorium, inventory }) {
    const unavailable = getUnavailableSeatIds(inventory);
    const { maxRowIndex, maxColumnIndex } = layoutMetrics(auditorium);
    const horizontalCenter = maxColumnIndex / 2;
    const sweetSpotRow = maxRowIndex * 0.58;
    const result = {};

    auditorium.seats.forEach(seat => {
        const horizontalQuality = 1 - Math.abs(seat.columnIndex - horizontalCenter) /
            Math.max(horizontalCenter, 1);
        const distanceQuality = 1 - Math.abs(seat.rowIndex - sweetSpotRow) /
            Math.max(maxRowIndex, 1);
        const localDemand = localUnavailableRatio(seat, auditorium, unavailable);
        const score = Math.round(clamp(
            horizontalQuality * 48 + distanceQuality * 34 + localDemand * 18
        ));
        const level = score >= 72 ? 'hot' : (score >= 50 ? 'warm' : 'cool');
        result[seat.id] = Object.freeze({ score, level });
    });

    return deepFreeze(result);
}
