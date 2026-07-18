import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';

export const MAX_TICKETS_PER_ORDER = 8;
export const RECOMMENDATION_PREFERENCES = Object.freeze([
    'center',
    'back',
    'aisle',
    'step-free'
]);

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function requireIsoDate(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${fieldName} 必须是 ISO 时间字符串`, { [fieldName]: value });
    }
    return value;
}

function normalizeTicketItems(ticketItems) {
    if (!Array.isArray(ticketItems) || ticketItems.length === 0) {
        throw new ValidationError('BookingDraft.ticketItems 必须是非空数组');
    }
    const seen = new Set();
    const normalized = ticketItems.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new ValidationError('ticket item 必须是对象');
        }
        const ticketTypeId = requireText(item.ticketTypeId, 'ticketTypeId');
        if (seen.has(ticketTypeId)) {
            throw new ValidationError('同一票种不得重复', { ticketTypeId });
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new ValidationError('票数必须是正整数', { ticketTypeId, quantity: item.quantity });
        }
        seen.add(ticketTypeId);
        return Object.freeze({ ticketTypeId, quantity: item.quantity });
    });
    const ticketCount = normalized.reduce((total, item) => total + item.quantity, 0);
    if (ticketCount < 1 || ticketCount > MAX_TICKETS_PER_ORDER) {
        throw new ValidationError(`单次购票数量必须为 1–${MAX_TICKETS_PER_ORDER}`, { ticketCount });
    }
    return { ticketItems: Object.freeze(normalized), ticketCount };
}

function normalizeSeatIds(seatIds, ticketCount) {
    if (!Array.isArray(seatIds)) {
        throw new ValidationError('BookingDraft.selectedSeatIds 必须是数组');
    }
    const normalized = seatIds.map(seatId => requireText(seatId, 'seatId'));
    if (new Set(normalized).size !== normalized.length) {
        throw new ValidationError('BookingDraft.selectedSeatIds 不得重复');
    }
    if (normalized.length > ticketCount) {
        throw new ValidationError('选中座位数不得超过票数', {
            ticketCount,
            selectedSeatCount: normalized.length
        });
    }
    return Object.freeze(normalized);
}

function normalizePreferences(preferences) {
    if (!Array.isArray(preferences)) {
        throw new ValidationError('BookingDraft.preferences 必须是数组');
    }
    const normalized = preferences.map(preference => requireText(preference, 'preference'));
    const invalid = normalized.find(preference => !RECOMMENDATION_PREFERENCES.includes(preference));
    if (invalid) throw new ValidationError('未知的推荐偏好', { preference: invalid });
    return Object.freeze([...new Set(normalized)]);
}

export function createBookingDraft({
    showtimeId,
    ticketItems,
    selectedSeatIds = [],
    preferences = [],
    accessibilityAcknowledged = false,
    updatedAt
}) {
    const normalizedTickets = normalizeTicketItems(ticketItems);
    if (typeof accessibilityAcknowledged !== 'boolean') {
        throw new ValidationError('accessibilityAcknowledged 必须是 boolean');
    }
    return Object.freeze({
        showtimeId: requireText(showtimeId, 'BookingDraft.showtimeId'),
        ticketItems: normalizedTickets.ticketItems,
        ticketCount: normalizedTickets.ticketCount,
        selectedSeatIds: normalizeSeatIds(selectedSeatIds, normalizedTickets.ticketCount),
        preferences: normalizePreferences(preferences),
        accessibilityAcknowledged,
        updatedAt: requireIsoDate(updatedAt, 'BookingDraft.updatedAt')
    });
}

export function replaceDraftSeats(draft, selectedSeatIds, updatedAt) {
    try {
        return ok(createBookingDraft({ ...draft, selectedSeatIds, updatedAt }));
    } catch (error) {
        return err('TICKET_COUNT_EXCEEDED', error.message, error.details || {});
    }
}

export function isDraftReadyForHold(draft) {
    return draft.ticketCount > 0 && draft.selectedSeatIds.length === draft.ticketCount;
}
