import { getUnavailableSeatIds } from './ShowtimeInventory.js';

export const AI_SEAT_VECTOR_DIMENSIONS = Object.freeze({
    screenDistance: '银幕距离',
    centerAlignment: '居中程度',
    surroundingSpace: '周边空位',
    priceLevel: '价格水平',
    quietness: '安静程度',
    egressEase: '进出便捷'
});

export const DEFAULT_AI_SEAT_TARGETS = Object.freeze({
    screenDistance: 58,
    centerAlignment: 75,
    surroundingSpace: 70,
    priceLevel: 15,
    quietness: 70,
    egressEase: 45
});

export const DEFAULT_AI_SEAT_WEIGHTS = Object.freeze({
    screenDistance: 0.2,
    centerAlignment: 0.2,
    surroundingSpace: 0.16,
    priceLevel: 0.12,
    quietness: 0.2,
    egressEase: 0.12
});

const DIMENSION_IDS = Object.freeze(Object.keys(AI_SEAT_VECTOR_DIMENSIONS));

function clamp(value, minimum = 0, maximum = 100) {
    return Math.min(maximum, Math.max(minimum, value));
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function layoutMetrics(auditorium) {
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

function quietnessValue(seats, auditorium, unavailable, selected) {
    const occupancyRatio = unavailable.size / Math.max(auditorium.seats.length, 1);
    const currentWeight = clamp(0.25 + occupancyRatio * 0.72, 0.25, 0.82);
    const risk = average(seats.map(seat => {
        const historical = historicalDisturbanceRisk(seat, auditorium);
        const current = currentNeighbourDisturbanceRisk(seat, auditorium, unavailable, selected);
        return historical * (1 - currentWeight) + current * currentWeight;
    }));
    return 100 - risk * 100;
}

function egressEaseValue(seats, auditorium) {
    const { maxRowIndex } = layoutMetrics(auditorium);
    const aisleDistance = aisleDistanceForBlock(auditorium, seats);
    const aisleValue = clamp(100 - aisleDistance * 17);
    const stepFreeValue = seats.every(seat => seat.stepFree) ? 100 : 48;
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const rearAccessValue = clamp((averageRow / Math.max(maxRowIndex, 1)) * 72 + aisleValue * 0.28);
    return aisleValue * 0.48 + stepFreeValue * 0.27 + rearAccessValue * 0.25;
}

export function normalizeAiSeatTargets(input = {}) {
    const targets = {};
    DIMENSION_IDS.forEach(id => {
        const value = Number(input[id]);
        targets[id] = Number.isFinite(value) ? Math.round(clamp(value)) : DEFAULT_AI_SEAT_TARGETS[id];
    });
    return Object.freeze(targets);
}

export function normalizeAiSeatWeights(input = {}) {
    const weights = {};
    let total = 0;
    DIMENSION_IDS.forEach(id => {
        const value = Number(input[id]);
        weights[id] = Number.isFinite(value) && value > 0 ? value : 0;
        total += weights[id];
    });
    if (total <= 0) return DEFAULT_AI_SEAT_WEIGHTS;
    DIMENSION_IDS.forEach(id => {
        weights[id] = weights[id] / total;
    });
    return Object.freeze(weights);
}

export function evaluateAiSeatVector({ auditorium, seats, inventory, pricingPolicy }) {
    const unavailable = getUnavailableSeatIds(inventory);
    const selected = new Set(seats.map(seat => seat.id));
    const { maxRowIndex, maxColumnIndex } = layoutMetrics(auditorium);
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const averageColumn = average(seats.map(seat => seat.columnIndex));
    const horizontalCenter = maxColumnIndex / 2;
    const edgeDistanceRatio = Math.abs(averageColumn - horizontalCenter) / Math.max(horizontalCenter, 1);
    const maximumSurcharge = pricingPolicy ?
        Math.max(...Object.values(pricingPolicy.seatZoneSurcharges), 0) : 0;
    const averageSurcharge = pricingPolicy ? average(seats.map(seat =>
        pricingPolicy.seatZoneSurcharges[seat.zoneId] || 0
    )) : 0;

    return Object.freeze({
        screenDistance: Math.round(clamp(averageRow / Math.max(maxRowIndex, 1) * 100)),
        centerAlignment: Math.round(clamp(100 - edgeDistanceRatio * 100)),
        surroundingSpace: Math.round(clamp(100 - average(seats.map(seat =>
            localUnavailableRatio(seat, auditorium, unavailable, selected)
        )) * 100)),
        priceLevel: maximumSurcharge === 0 ? 0 : Math.round(clamp(averageSurcharge / maximumSurcharge * 100)),
        quietness: Math.round(clamp(quietnessValue(seats, auditorium, unavailable, selected))),
        egressEase: Math.round(clamp(egressEaseValue(seats, auditorium)))
    });
}

export function weightedEuclideanMatch({ vector, targets, weights }) {
    const normalizedTargets = normalizeAiSeatTargets(targets);
    const normalizedWeights = normalizeAiSeatWeights(weights);
    let squared = 0;
    DIMENSION_IDS.forEach(id => {
        const delta = ((vector[id] ?? 0) - normalizedTargets[id]) / 100;
        squared += normalizedWeights[id] * delta * delta;
    });
    const distance = Math.sqrt(squared);
    return Object.freeze({
        distance,
        score: Math.round(clamp(100 - distance * 100)),
        targets: normalizedTargets,
        weights: normalizedWeights
    });
}

export function aiSeatVectorRows({ vector, targets, weights }) {
    const normalizedTargets = normalizeAiSeatTargets(targets);
    const normalizedWeights = normalizeAiSeatWeights(weights);
    return Object.freeze(DIMENSION_IDS.map(id => Object.freeze({
        id,
        label: AI_SEAT_VECTOR_DIMENSIONS[id],
        value: Math.round(clamp(vector[id] ?? 0)),
        target: normalizedTargets[id],
        weight: normalizedWeights[id]
    })));
}
