import { replaceDraftSeats, PARTY_TYPE_LABELS } from '../../domain/booking/BookingDraft.js';
import { validateSeatSelection } from '../../domain/booking/SeatSelectionPolicy.js';
import { getUnavailableSeatIds } from '../../domain/booking/ShowtimeInventory.js';
import { err, ok } from '../../shared/Result.js';

const PREFERENCE_LABELS = Object.freeze({
    center: '靠近中央',
    back: '靠后排',
    aisle: '靠近过道',
    'step-free': '无台阶通行'
});

function groupAvailableSeats(auditorium, unavailable, allowAccessibleSeats) {
    const groups = new Map();
    auditorium.seats.forEach(seat => {
        if (unavailable.has(seat.id)) return;
        if (!allowAccessibleSeats && ['wheelchair', 'companion'].includes(seat.kind)) return;
        const key = String(seat.rowIndex);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(seat);
    });
    return [...groups.values()].map(seats =>
        [...seats].sort((left, right) => left.columnIndex - right.columnIndex)
    );
}

function contiguousWindows(seats, count) {
    const windows = [];
    for (let start = 0; start <= seats.length - count; start++) {
        const candidate = seats.slice(start, start + count);
        if (candidate.every((seat, index) =>
            index === 0 || seat.columnIndex === candidate[index - 1].columnIndex + 1
        )) {
            windows.push(candidate);
        }
    }
    return windows;
}

function arrangementBlock(seats) {
    const sorted = [...seats].sort((left, right) => left.columnIndex - right.columnIndex);
    return Object.freeze({
        rowIndex: sorted[0].rowIndex,
        startColumn: sorted[0].columnIndex,
        endColumn: sorted[sorted.length - 1].columnIndex,
        centerKey: sorted[0].columnIndex * 2 + sorted.length - 1,
        seats: Object.freeze(sorted)
    });
}

function sameRowArrangement(seats) {
    const block = arrangementBlock(seats);
    return Object.freeze({
        type: 'same-row',
        blocks: Object.freeze([block]),
        rowSpan: 0,
        centerOffset: 0,
        blockSizeDifference: 0,
        boundingWidth: block.endColumn - block.startColumn + 1
    });
}

function adjacentRowPartitionSizes(ticketCount) {
    if (ticketCount === 3) return Object.freeze([1, 2]);
    if (ticketCount < 4) return Object.freeze([]);
    const maximumDifference = Math.max(2, Math.floor(ticketCount * 0.25));
    const sizes = [];
    for (let firstSize = 2; firstSize <= ticketCount - 2; firstSize++) {
        if (Math.abs(firstSize - (ticketCount - firstSize)) <= maximumDifference) {
            sizes.push(firstSize);
        }
    }
    return Object.freeze(sizes);
}

function supportsAdjacentRows(draft) {
    return draft.ticketCount >= 3 &&
        ['friends', 'family', 'group'].includes(draft.partyType);
}

function adjacentRowArrangements(groups, draft) {
    if (!supportsAdjacentRows(draft)) return [];
    const rows = new Map(groups.map(seats => [seats[0].rowIndex, seats]));
    const arrangements = [];
    const partitions = adjacentRowPartitionSizes(draft.ticketCount);
    [...rows.keys()].sort((left, right) => left - right).forEach(rowIndex => {
        const upperSeats = rows.get(rowIndex);
        const lowerSeats = rows.get(rowIndex + 1);
        if (!lowerSeats) return;
        partitions.forEach(upperCount => {
            const lowerCount = draft.ticketCount - upperCount;
            const upperWindows = contiguousWindows(upperSeats, upperCount).map(arrangementBlock);
            const lowerWindowsByCenter = new Map();
            contiguousWindows(lowerSeats, lowerCount).map(arrangementBlock).forEach(block => {
                if (!lowerWindowsByCenter.has(block.centerKey)) {
                    lowerWindowsByCenter.set(block.centerKey, []);
                }
                lowerWindowsByCenter.get(block.centerKey).push(block);
            });
            upperWindows.forEach(upper => {
                for (let centerKey = upper.centerKey - 2; centerKey <= upper.centerKey + 2; centerKey++) {
                    (lowerWindowsByCenter.get(centerKey) || []).forEach(lower => {
                        const seats = [...upper.seats, ...lower.seats];
                        if (new Set(seats.map(seat => seat.sectionId)).size !== 1) return;
                        const minimumColumn = Math.min(upper.startColumn, lower.startColumn);
                        const maximumColumn = Math.max(upper.endColumn, lower.endColumn);
                        arrangements.push(Object.freeze({
                            seats: Object.freeze(seats),
                            arrangement: Object.freeze({
                                type: 'adjacent-rows',
                                blocks: Object.freeze([upper, lower]),
                                rowSpan: 1,
                                centerOffset: Math.abs(upper.centerKey - lower.centerKey) / 2,
                                blockSizeDifference: Math.abs(upper.seats.length - lower.seats.length),
                                boundingWidth: maximumColumn - minimumColumn + 1
                            })
                        }));
                    });
                }
            });
        });
    });
    return arrangements;
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value) {
    return Math.max(0, Math.min(1, value));
}

function sectionBounds(auditorium, seat) {
    const columns = auditorium.seats
        .filter(candidate =>
            candidate.rowIndex === seat.rowIndex &&
            candidate.sectionId === seat.sectionId
        )
        .map(candidate => candidate.columnIndex);
    return {
        left: Math.min(...columns),
        right: Math.max(...columns)
    };
}

function aisleDistance(seats, auditorium) {
    return Math.min(...seats.map(seat => {
        const bounds = sectionBounds(auditorium, seat);
        return Math.min(
            seat.columnIndex - bounds.left,
            bounds.right - seat.columnIndex
        );
    }));
}

function preferenceAssessment(seats, auditorium, preferences) {
    const maxRowIndex = Math.max(...auditorium.seats.map(seat => seat.rowIndex), 1);
    const maxColumnIndex = Math.max(...auditorium.seats.map(seat => seat.columnIndex), 1);
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const averageColumn = average(seats.map(seat => seat.columnIndex));
    const horizontalCenter = maxColumnIndex / 2;
    const edgeDistance = aisleDistance(seats, auditorium);
    const scores = Object.freeze({
        center: clampScore(1 - Math.abs(averageColumn - horizontalCenter) / Math.max(1, horizontalCenter)),
        back: clampScore(averageRow / maxRowIndex),
        aisle: clampScore(1 - edgeDistance / Math.max(1, maxColumnIndex / 4)),
        'step-free': seats.every(seat => seat.stepFree) ? 1 : 0
    });
    const satisfiedById = Object.freeze({
        center: seats.every(seat => seat.sectionId === 'center'),
        back: averageRow >= maxRowIndex * 0.6,
        aisle: edgeDistance === 0,
        'step-free': scores['step-free'] === 1
    });
    const selectedScores = preferences.map(preference => scores[preference]);
    return Object.freeze({
        scores,
        minimum: selectedScores.length > 0 ? Math.min(...selectedScores) : 1,
        total: selectedScores.reduce((sum, score) => sum + score, 0),
        satisfied: Object.freeze(preferences.filter(preference => satisfiedById[preference])),
        unmet: Object.freeze(preferences.filter(preference => !satisfiedById[preference]))
    });
}

function nearbyUnavailableCount(seats, auditorium, unavailable) {
    const firstColumn = Math.min(...seats.map(seat => seat.columnIndex));
    const lastColumn = Math.max(...seats.map(seat => seat.columnIndex));
    const firstRow = Math.min(...seats.map(seat => seat.rowIndex));
    const lastRow = Math.max(...seats.map(seat => seat.rowIndex));
    return auditorium.seats.filter(seat =>
        unavailable.has(seat.id) &&
        seat.rowIndex >= firstRow - 1 &&
        seat.rowIndex <= lastRow + 1 &&
        seat.columnIndex >= firstColumn - 2 &&
        seat.columnIndex <= lastColumn + 2
    ).length;
}

function audienceAssessment(seats, auditorium, draft) {
    const ticketTypeIds = new Set(draft.ticketItems.map(item => item.ticketTypeId));
    const maxRowIndex = Math.max(...auditorium.seats.map(seat => seat.rowIndex), 1);
    const hasChild = ticketTypeIds.has('child');
    const hasSenior = ticketTypeIds.has('senior');
    const minimumRowIndex = hasChild ? Math.min(3, maxRowIndex) : 0;
    const maximumRowIndex = hasSenior ? Math.max(0, maxRowIndex - 3) : maxRowIndex;
    let violatingSeatCount = 0;
    let totalBoundaryDistance = 0;
    seats.forEach(seat => {
        let violates = false;
        if (hasChild && seat.rowIndex < minimumRowIndex) {
            violates = true;
            totalBoundaryDistance += minimumRowIndex - seat.rowIndex;
        }
        if (hasSenior && seat.rowIndex > maximumRowIndex) {
            violates = true;
            totalBoundaryDistance += seat.rowIndex - maximumRowIndex;
        }
        if (violates) violatingSeatCount++;
    });
    const childGuidanceMet = !hasChild || seats.every(seat => seat.rowIndex >= minimumRowIndex);
    const seniorGuidanceMet = !hasSenior || seats.every(seat => seat.rowIndex <= maximumRowIndex);
    let score = 0;
    const averageRow = average(seats.map(seat => seat.rowIndex));
    if (hasChild) {
        score -= Math.max(0, 3 - averageRow) * 12;
        score -= Math.abs(averageRow - maxRowIndex * 0.55) * 1.5;
    }
    if (hasSenior) {
        score -= Math.max(0, averageRow - (maxRowIndex - 3)) * 9;
        score += Math.max(0, 4 - aisleDistance(seats, auditorium));
    }
    return Object.freeze({
        score,
        hasChild,
        hasSenior,
        childGuidanceMet,
        seniorGuidanceMet,
        satisfied: childGuidanceMet && seniorGuidanceMet,
        violatingSeatCount,
        totalBoundaryDistance,
        minimumRowIndex,
        maximumRowIndex
    });
}

function experienceScore(seats, auditorium, partyType, unavailable) {
    const maxRowIndex = Math.max(...auditorium.seats.map(seat => seat.rowIndex), 1);
    const maxColumnIndex = Math.max(...auditorium.seats.map(seat => seat.columnIndex), 1);
    const averageRow = average(seats.map(seat => seat.rowIndex));
    const averageColumn = average(seats.map(seat => seat.columnIndex));
    const horizontalCenter = maxColumnIndex / 2;
    const sweetSpotRow = maxRowIndex * (partyType === 'couple' ? 0.68 : 0.58);
    let score = 100;
    score -= Math.abs(averageColumn - horizontalCenter) * 3.2;
    score -= Math.abs(averageRow - sweetSpotRow) * 4.5;
    if (partyType === 'couple') {
        score -= Math.abs(averageColumn - horizontalCenter) * 4.5;
        score -= Math.abs(averageRow - sweetSpotRow) * 2.5;
        score -= nearbyUnavailableCount(seats, auditorium, unavailable) * 7;
    } else if (partyType === 'family') {
        score -= Math.abs(averageRow - maxRowIndex * 0.62) * 3;
    } else if (partyType === 'group') {
        score -= Math.abs(averageColumn - horizontalCenter) * 1.5;
    }
    return score;
}

function seatSurchargeAmount(seats, pricingPolicy) {
    if (!pricingPolicy) return 0;
    return seats.reduce((sum, seat) =>
        sum + (pricingPolicy.seatZoneSurcharges[seat.zoneId] || 0), 0);
}

function movementAssessment(seats, auditorium, preserveSeatIds) {
    if (preserveSeatIds.length === 0) return Object.freeze({ preserved: 0, distance: 0 });
    const preservedSet = new Set(preserveSeatIds);
    const previousSeats = preserveSeatIds
        .map(id => auditorium.seats.find(seat => seat.id === id))
        .filter(Boolean);
    const previousRow = previousSeats.length > 0 ?
        average(previousSeats.map(seat => seat.rowIndex)) : 0;
    const previousColumn = previousSeats.length > 0 ?
        average(previousSeats.map(seat => seat.columnIndex)) : 0;
    return Object.freeze({
        preserved: seats.filter(seat => preservedSet.has(seat.id)).length,
        distance: Math.abs(average(seats.map(seat => seat.rowIndex)) - previousRow) * 4 +
            Math.abs(average(seats.map(seat => seat.columnIndex)) - previousColumn)
    });
}

function compareCandidates(left, right, preserveSeatIds) {
    if (left.audience.violatingSeatCount !== right.audience.violatingSeatCount) {
        return left.audience.violatingSeatCount - right.audience.violatingSeatCount;
    }
    if (left.audience.totalBoundaryDistance !== right.audience.totalBoundaryDistance) {
        return left.audience.totalBoundaryDistance - right.audience.totalBoundaryDistance;
    }
    if (preserveSeatIds.length > 0) {
        if (right.movement.preserved !== left.movement.preserved) {
            return right.movement.preserved - left.movement.preserved;
        }
        if (left.movement.distance !== right.movement.distance) {
            return left.movement.distance - right.movement.distance;
        }
    }
    if (left.arrangement.type !== right.arrangement.type) {
        return left.arrangement.type === 'same-row' ? -1 : 1;
    }
    if (left.arrangement.blockSizeDifference !== right.arrangement.blockSizeDifference) {
        return left.arrangement.blockSizeDifference - right.arrangement.blockSizeDifference;
    }
    if (left.arrangement.centerOffset !== right.arrangement.centerOffset) {
        return left.arrangement.centerOffset - right.arrangement.centerOffset;
    }
    if (left.crossesAisle !== right.crossesAisle) return left.crossesAisle ? 1 : -1;
    if (right.preference.minimum !== left.preference.minimum) {
        return right.preference.minimum - left.preference.minimum;
    }
    if (right.preference.total !== left.preference.total) {
        return right.preference.total - left.preference.total;
    }
    if (right.audience.score !== left.audience.score) {
        return right.audience.score - left.audience.score;
    }
    if (right.experience !== left.experience) return right.experience - left.experience;
    if (left.surchargeAmount !== right.surchargeAmount) {
        return left.surchargeAmount - right.surchargeAmount;
    }
    return left.seats[0].id.localeCompare(right.seats[0].id);
}

function fallbackLevel(candidate) {
    if (!candidate.audience.satisfied) return 'age-relaxed';
    if (candidate.arrangement.type === 'adjacent-rows') return 'adjacent-rows';
    if (candidate.crossesAisle) return 'cross-aisle';
    return candidate.preference.unmet.length > 0 ? 'compromise' : 'exact';
}

function recommendationReason(draft, candidate) {
    const labels = candidate.seats.map(seat => seat.label).join('、');
    const parts = [`已推荐 ${labels}`];
    if (candidate.preference.satisfied.length > 0) {
        parts.push(`满足${candidate.preference.satisfied.map(id => PREFERENCE_LABELS[id]).join('、')}`);
    } else {
        parts.push(candidate.arrangement.type === 'same-row' ?
            `${PARTY_TYPE_LABELS[draft.partyType]}同排连座` :
            `${PARTY_TYPE_LABELS[draft.partyType]}已安排相邻两排紧凑座位`);
    }
    if (candidate.preference.unmet.length > 0) {
        parts.push(`当前连座未能满足${candidate.preference.unmet.map(id => PREFERENCE_LABELS[id]).join('、')}`);
    }
    if (candidate.arrangement.type === 'adjacent-rows') {
        parts.push('两排座位前后对齐');
    } else if (candidate.crossesAisle) {
        parts.push('座位连续，但中间隔有过道');
    }
    if (candidate.audience.hasChild) {
        parts.push(candidate.audience.childGuidanceMet ?
            '已避开前三排' : '当前没有符合年龄建议的紧凑座位，位置较靠前');
    }
    if (candidate.audience.hasSenior) {
        parts.push(candidate.audience.seniorGuidanceMet ?
            '已避开后三排' : '当前没有符合年龄建议的紧凑座位，位置较靠后');
    }
    if (candidate.surchargeAmount > 0) {
        parts.push(`含优选区附加费 ¥${(candidate.surchargeAmount / 100).toFixed(0)}`);
    }
    return parts.join('；');
}

function diverseCandidates(candidates, limit) {
    if (candidates.length <= limit) return candidates;
    const selected = [candidates[0]];
    const selectedIds = new Set([candidates[0].seatKey]);
    const arrangementRowKey = candidate =>
        candidate.arrangement.blocks.map(block => block.rowIndex).join('-');
    const usedRows = new Set([arrangementRowKey(candidates[0])]);
    for (const candidate of candidates) {
        if (selected.length >= limit) break;
        const rowKey = arrangementRowKey(candidate);
        if (!usedRows.has(rowKey)) {
            selected.push(candidate);
            selectedIds.add(candidate.seatKey);
            usedRows.add(rowKey);
        }
    }
    for (const candidate of candidates) {
        if (selected.length >= limit) break;
        if (!selectedIds.has(candidate.seatKey)) {
            selected.push(candidate);
            selectedIds.add(candidate.seatKey);
        }
    }
    return selected;
}

export function recommendSeatBlocks({
    draft,
    auditorium,
    inventory,
    pricingPolicy = null,
    updatedAt = draft.updatedAt,
    policy = {},
    preserveSeatIds = [],
    limit = 5
}) {
    const unavailable = getUnavailableSeatIds(inventory);
    const requiresStepFree = draft.preferences.includes('step-free');
    const groups = groupAvailableSeats(
        auditorium,
        unavailable,
        draft.accessibilityAcknowledged
    );
    const arrangements = [
        ...groups
            .flatMap(rowSeats => contiguousWindows(rowSeats, draft.ticketCount))
            .map(seats => Object.freeze({
                seats: Object.freeze(seats),
                arrangement: sameRowArrangement(seats)
            })),
        ...adjacentRowArrangements(groups, draft)
    ];
    const candidatesBySeatKey = new Map();
    for (const item of arrangements) {
        const seats = [...item.seats]
            .sort((left, right) => left.rowIndex - right.rowIndex ||
                left.columnIndex - right.columnIndex);
        if (requiresStepFree && !seats.every(seat => seat.stepFree)) continue;
        const selected = replaceDraftSeats(draft, seats.map(seat => seat.id), updatedAt);
        if (!selected.ok) continue;
        const validation = validateSeatSelection({
            draft: selected.value,
            auditorium,
            inventory,
            policy
        });
        if (!validation.ok) continue;
        const preference = preferenceAssessment(seats, auditorium, draft.preferences);
        const audience = audienceAssessment(seats, auditorium, draft);
        const seatKey = seats.map(seat => seat.id).sort().join('|');
        const candidate = {
            draft: selected.value,
            seats: Object.freeze([...seats]),
            seatKey,
            arrangement: item.arrangement,
            preference,
            audience,
            experience: experienceScore(seats, auditorium, draft.partyType, unavailable),
            surchargeAmount: seatSurchargeAmount(seats, pricingPolicy),
            crossesAisle: new Set(seats.map(seat => seat.sectionId)).size > 1,
            movement: movementAssessment(seats, auditorium, preserveSeatIds)
        };
        if (!candidatesBySeatKey.has(seatKey)) candidatesBySeatKey.set(seatKey, candidate);
    }
    const allCandidates = [...candidatesBySeatKey.values()];
    const strictCandidates = allCandidates.filter(candidate => candidate.audience.satisfied);
    const candidates = strictCandidates.length > 0 ? strictCandidates : allCandidates;
    candidates.sort((left, right) => compareCandidates(left, right, preserveSeatIds));
    return Object.freeze(diverseCandidates(candidates, Math.max(1, Math.min(5, limit))).map(candidate =>
        Object.freeze({
            draft: candidate.draft,
            seats: candidate.seats,
            arrangement: candidate.arrangement,
            constraints: Object.freeze({
                ageStatus: candidate.audience.satisfied ? 'satisfied' : 'relaxed',
                childFrontRowViolation: !candidate.audience.childGuidanceMet,
                seniorBackRowViolation: !candidate.audience.seniorGuidanceMet,
                violatingSeatCount: candidate.audience.violatingSeatCount,
                totalBoundaryDistance: candidate.audience.totalBoundaryDistance
            }),
            satisfiedPreferences: candidate.preference.satisfied,
            unmetPreferences: candidate.preference.unmet,
            fallbackLevel: fallbackLevel(candidate),
            crossesAisle: candidate.crossesAisle,
            surchargeAmount: candidate.surchargeAmount,
            reason: recommendationReason(draft, candidate)
        })
    ));
}

export function recommendSeatBlock(options) {
    const candidates = recommendSeatBlocks({ ...options, limit: 1 });
    if (candidates.length > 0) return ok(candidates[0]);
    return err(
        'NO_CONTIGUOUS_SEATS',
        `没有找到 ${options.draft.ticketCount} 个符合规则的连续座位`,
        { ticketCount: options.draft.ticketCount }
    );
}

export default recommendSeatBlock;
