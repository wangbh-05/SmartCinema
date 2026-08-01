import { getUnavailableSeatIds } from './ShowtimeInventory.js';
import {
    DEFAULT_SEAT_PREFERENCE_TARGETS,
    DEFAULT_SEAT_PREFERENCE_WEIGHTS,
    normalizeSeatPreferenceTargets,
    normalizeSeatPreferenceWeights,
    SEAT_PREFERENCE_DIMENSIONS
} from './SeatPreferenceIntent.js';

const DIMENSION_IDS = Object.freeze(Object.keys(SEAT_PREFERENCE_DIMENSIONS));

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
    return { left: Math.min(...columns), right: Math.max(...columns) };
}

function aisleDistance(seats, auditorium) {
    return Math.min(...seats.map(seat => {
        const bounds = sectionBounds(auditorium, seat);
        return Math.min(seat.columnIndex - bounds.left, bounds.right - seat.columnIndex);
    }));
}

function localUnavailableRatio(seat, auditorium, unavailable, selected) {
    const neighbours = auditorium.seats.filter(candidate =>
        candidate.id !== seat.id &&
        candidate.rowIndex === seat.rowIndex &&
        candidate.sectionId === seat.sectionId &&
        Math.abs(candidate.columnIndex - seat.columnIndex) <= 2
    );
    if (neighbours.length === 0) return 0;
    return neighbours.filter(candidate => unavailable.has(candidate.id) && !selected.has(candidate.id)).length /
        neighbours.length;
}

function disturbanceRisk(seat, auditorium, unavailable, selected) {
    const { maxRowIndex, maxColumnIndex } = layoutMetrics(auditorium);
    const center = maxColumnIndex / 2;
    const popularRow = maxRowIndex * 0.62;
    const demand = clamp(
        (1 - Math.abs(seat.columnIndex - center) / Math.max(center, 1)) *
        (1 - Math.abs(seat.rowIndex - popularRow) / Math.max(maxRowIndex, 1)),
        0,
        1
    );
    const occupied = localUnavailableRatio(seat, auditorium, unavailable, selected);
    return demand * 0.42 + occupied * 0.58;
}

export function evaluateSeatPreferenceVector({ auditorium, seats, inventory, pricingPolicy }) {
    const unavailable = getUnavailableSeatIds(inventory);
    const selected = new Set(seats.map(seat => seat.id));
    const { maxRowIndex, maxColumnIndex } = layoutMetrics(auditorium);
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const averageColumn = average(seats.map(seat => seat.columnIndex));
    const horizontalCenter = maxColumnIndex / 2;
    const maximumSurcharge = pricingPolicy ?
        Math.max(...Object.values(pricingPolicy.seatZoneSurcharges), 0) : 0;
    const averageSurcharge = pricingPolicy ? average(seats.map(seat =>
        pricingPolicy.seatZoneSurcharges[seat.zoneId] || 0
    )) : 0;
    const edgeDistance = aisleDistance(seats, auditorium);
    const stepFreeScore = seats.every(seat => seat.stepFree) ? 100 : 48;

    return Object.freeze({
        screenDistance: Math.round(clamp(averageRow / maxRowIndex * 100)),
        centerAlignment: Math.round(clamp(
            100 - Math.abs(averageColumn - horizontalCenter) / Math.max(horizontalCenter, 1) * 100
        )),
        surroundingSpace: Math.round(clamp(100 - average(seats.map(seat =>
            localUnavailableRatio(seat, auditorium, unavailable, selected)
        )) * 100)),
        priceLevel: maximumSurcharge === 0 ? 0 :
            Math.round(clamp(averageSurcharge / maximumSurcharge * 100)),
        lowDisturbance: Math.round(clamp(100 - average(seats.map(seat =>
            disturbanceRisk(seat, auditorium, unavailable, selected)
        )) * 100)),
        egressEase: Math.round(clamp(
            (100 - edgeDistance * 17) * 0.65 + stepFreeScore * 0.35
        ))
    });
}

export function matchSeatPreferenceVector({ vector, targets, weights }) {
    const normalizedTargets = normalizeSeatPreferenceTargets(targets || DEFAULT_SEAT_PREFERENCE_TARGETS);
    const normalizedWeights = normalizeSeatPreferenceWeights(weights || DEFAULT_SEAT_PREFERENCE_WEIGHTS);
    let squaredDistance = 0;
    DIMENSION_IDS.forEach(id => {
        const delta = ((vector[id] ?? 0) - normalizedTargets[id]) / 100;
        squaredDistance += normalizedWeights[id] * delta * delta;
    });
    const distance = Math.sqrt(squaredDistance);
    return Object.freeze({
        distance,
        score: Math.round(clamp(100 - distance * 100)),
        targets: normalizedTargets,
        weights: normalizedWeights
    });
}

export function seatPreferenceVectorRows({ vector, targets, weights }) {
    const normalizedTargets = normalizeSeatPreferenceTargets(targets);
    const normalizedWeights = normalizeSeatPreferenceWeights(weights);
    return Object.freeze(DIMENSION_IDS.map(id => Object.freeze({
        id,
        label: SEAT_PREFERENCE_DIMENSIONS[id],
        value: vector[id],
        target: normalizedTargets[id],
        weight: normalizedWeights[id]
    })));
}
