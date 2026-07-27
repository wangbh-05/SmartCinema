import { getUnavailableSeatIds } from './ShowtimeInventory.js';

export const SEAT_EXPERIENCE_DIMENSIONS = Object.freeze({
    view: '视野角度',
    distance: '银幕距离',
    surroundings: '周边空位',
    value: '价格平衡',
    quietness: '安静程度',
    convenience: '进出便捷'
});

export const DEFAULT_EXPERIENCE_WEIGHTS = Object.freeze({
    view: 0.3,
    distance: 0.25,
    surroundings: 0.16,
    value: 0.12,
    quietness: 0.09,
    convenience: 0.08
});

function clamp(value, minimum = 0, maximum = 100) {
    return Math.min(maximum, Math.max(minimum, value));
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function layoutMetrics(auditorium) {
    return {
        maxRowIndex: Math.max(...auditorium.seats.map(seat => seat.rowIndex), 1),
        maxColumnIndex: Math.max(...auditorium.seats.map(seat => seat.columnIndex), 1)
    };
}

function sectionBounds(auditorium, seat) {
    const columns = auditorium.seats
        .filter(candidate => candidate.rowIndex === seat.rowIndex && candidate.sectionId === seat.sectionId)
        .map(candidate => candidate.columnIndex);
    return {
        left: Math.min(...columns),
        right: Math.max(...columns)
    };
}

function aisleDistanceForBlock(auditorium, seats) {
    const bounds = sectionBounds(auditorium, seats[0]);
    return Math.min(
        seats[0].columnIndex - bounds.left,
        bounds.right - seats[seats.length - 1].columnIndex
    );
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

function historicalDisturbanceRisk(seat, auditorium) {
    const { maxRowIndex, maxColumnIndex } = layoutMetrics(auditorium);
    const horizontalCenter = maxColumnIndex / 2;
    const popularRow = maxRowIndex * 0.62;
    const centerDemand = 1 - Math.abs(seat.columnIndex - horizontalCenter) / Math.max(horizontalCenter, 1);
    const rowDemand = 1 - Math.abs(seat.rowIndex - popularRow) / Math.max(maxRowIndex, 1);
    const popularityRisk = clamp(centerDemand * rowDemand, 0, 1);
    const bounds = sectionBounds(auditorium, seat);
    const aisleDistance = Math.min(seat.columnIndex - bounds.left, bounds.right - seat.columnIndex);
    const aisleRisk = clamp(1 - aisleDistance / 4, 0, 1);
    const rearTrafficRisk = clamp(seat.rowIndex / Math.max(maxRowIndex, 1), 0, 1);
    const stepFreeTrafficRisk = seat.stepFree ? 1 : 0;

    return clamp(
        popularityRisk * 0.48 +
        aisleRisk * 0.22 +
        rearTrafficRisk * 0.18 +
        stepFreeTrafficRisk * 0.12,
        0,
        1
    );
}

function currentNeighbourDisturbanceRisk(seat, auditorium, unavailable, selected = new Set()) {
    let occupiedWeight = 0;
    let totalWeight = 0;
    auditorium.seats.forEach(candidate => {
        if (candidate.id === seat.id || selected.has(candidate.id)) return;
        const rowDistance = Math.abs(candidate.rowIndex - seat.rowIndex);
        const columnDistance = Math.abs(candidate.columnIndex - seat.columnIndex);
        if (rowDistance > 2 || columnDistance > 3) return;
        const weight = 1 / (1 + rowDistance * 1.15 + columnDistance * 0.55);
        totalWeight += weight;
        if (unavailable.has(candidate.id)) occupiedWeight += weight;
    });
    return totalWeight === 0 ? 0 : occupiedWeight / totalWeight;
}

function quietnessScore(seats, auditorium, unavailable, selected) {
    const occupancyRatio = unavailable.size / Math.max(auditorium.seats.length, 1);
    const currentWeight = clamp(0.25 + occupancyRatio * 0.72, 0.25, 0.82);
    const risk = average(seats.map(seat => {
        const historical = historicalDisturbanceRisk(seat, auditorium);
        const current = currentNeighbourDisturbanceRisk(seat, auditorium, unavailable, selected);
        return historical * (1 - currentWeight) + current * currentWeight;
    }));
    return 100 - risk * 82;
}

function convenienceScore(seats, auditorium) {
    const { maxRowIndex } = layoutMetrics(auditorium);
    const aisleDistance = aisleDistanceForBlock(auditorium, seats);
    const aisleScore = clamp(100 - aisleDistance * 17);
    const stepFreeScore = seats.every(seat => seat.stepFree) ? 100 : 48;
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const rearAccessScore = clamp((averageRow / Math.max(maxRowIndex, 1)) * 72 + aisleScore * 0.28);
    return aisleScore * 0.48 + stepFreeScore * 0.27 + rearAccessScore * 0.25;
}

function dimension(id, score) {
    return Object.freeze({
        id,
        label: SEAT_EXPERIENCE_DIMENSIONS[id],
        score: Math.round(clamp(score))
    });
}

export function normalizeExperienceWeights(input = DEFAULT_EXPERIENCE_WEIGHTS) {
    const weights = {};
    let total = 0;
    Object.keys(SEAT_EXPERIENCE_DIMENSIONS).forEach(id => {
        const value = Number(input[id]);
        weights[id] = Number.isFinite(value) && value > 0 ? value : 0;
        total += weights[id];
    });
    if (total <= 0) return DEFAULT_EXPERIENCE_WEIGHTS;
    Object.keys(weights).forEach(id => {
        weights[id] = weights[id] / total;
    });
    return Object.freeze(weights);
}

export function scoreDimensions(dimensions, weights = DEFAULT_EXPERIENCE_WEIGHTS) {
    const normalizedWeights = normalizeExperienceWeights(weights);
    return Math.round(dimensions.reduce((total, item) =>
        total + item.score * (normalizedWeights[item.id] || 0), 0
    ));
}

export function evaluateSeatBlockExperience({
    auditorium,
    seats,
    inventory,
    pricingPolicy,
    weights = DEFAULT_EXPERIENCE_WEIGHTS
}) {
    const unavailable = getUnavailableSeatIds(inventory);
    const selected = new Set(seats.map(seat => seat.id));
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
    const maximumSurcharge = pricingPolicy ?
        Math.max(...Object.values(pricingPolicy.seatZoneSurcharges), 0) : 0;
    const averageSurcharge = pricingPolicy ? average(seats.map(seat =>
        pricingPolicy.seatZoneSurcharges[seat.zoneId] || 0
    )) : 0;

    const dimensions = Object.freeze([
        dimension('view', 100 - horizontalDistance * 72),
        dimension('distance', 100 - rowDistance * 150),
        dimension('surroundings', 100 - crowding * 58),
        dimension('value', maximumSurcharge === 0 ? 100 : 100 - averageSurcharge / maximumSurcharge * 24),
        dimension('quietness', quietnessScore(seats, auditorium, unavailable, selected)),
        dimension('convenience', convenienceScore(seats, auditorium))
    ]);

    return Object.freeze({
        dimensions,
        score: scoreDimensions(dimensions, weights),
        weights: normalizeExperienceWeights(weights)
    });
}

export function createSeatPopularityMapFromExperience({ auditorium, inventory }) {
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
        const historicalRisk = historicalDisturbanceRisk(seat, auditorium);
        const score = Math.round(clamp(
            horizontalQuality * 42 + distanceQuality * 30 + localDemand * 16 + historicalRisk * 12
        ));
        const level = score >= 72 ? 'hot' : (score >= 50 ? 'warm' : 'cool');
        result[seat.id] = Object.freeze({ score, level });
    });

    return Object.freeze(result);
}
