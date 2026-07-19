import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';

export const MAX_TICKETS_PER_ORDER = 20;
export const RECOMMENDATION_PREFERENCES = Object.freeze([
    'center',
    'back',
    'aisle',
    'step-free'
]);
export const PARTY_TYPES = Object.freeze(['solo', 'couple', 'friends', 'family', 'group']);
export const PARTY_TYPE_LABELS = Object.freeze({
    solo: '单人观影',
    couple: '情侣观影',
    friends: '朋友同行',
    family: '家庭观影',
    group: '团体观影'
});

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

function inferPartyType(ticketItems, ticketCount) {
    const ticketTypeIds = new Set(ticketItems.map(item => item.ticketTypeId));
    if (ticketCount === 1) return 'solo';
    if (ticketCount >= 5) return 'group';
    if (ticketTypeIds.has('child') || ticketTypeIds.has('senior')) return 'family';
    return 'friends';
}

function isPartyTypeAllowed(partyType, ticketCount) {
    if (partyType === 'solo') return ticketCount === 1;
    if (partyType === 'couple') return ticketCount === 2;
    if (partyType === 'friends') return ticketCount >= 2 && ticketCount <= 4;
    if (partyType === 'family') return ticketCount >= 2 && ticketCount <= 8;
    if (partyType === 'group') return ticketCount >= 5 && ticketCount <= MAX_TICKETS_PER_ORDER;
    return false;
}

export function getPartyTypeOptions(ticketItems) {
    const normalized = normalizeTicketItems(ticketItems);
    const recommended = inferPartyType(normalized.ticketItems, normalized.ticketCount);
    return Object.freeze(PARTY_TYPES.map(id => Object.freeze({
        id,
        label: PARTY_TYPE_LABELS[id],
        allowed: isPartyTypeAllowed(id, normalized.ticketCount),
        recommended: id === recommended
    })));
}

function normalizePartyType(partyType, ticketItems, ticketCount) {
    const normalized = partyType ?? inferPartyType(ticketItems, ticketCount);
    if (!PARTY_TYPES.includes(normalized)) {
        throw new ValidationError('未知的同行方式', { partyType: normalized });
    }
    if (!isPartyTypeAllowed(normalized, ticketCount)) {
        throw new ValidationError(`${PARTY_TYPE_LABELS[normalized]}与当前票数不匹配`, {
            partyType: normalized,
            ticketCount
        });
    }
    return normalized;
}

export function createBookingDraft({
    showtimeId,
    ticketItems,
    selectedSeatIds = [],
    preferences = [],
    partyType = null,
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
        partyType: normalizePartyType(
            partyType,
            normalizedTickets.ticketItems,
            normalizedTickets.ticketCount
        ),
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
