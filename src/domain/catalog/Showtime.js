import { ValidationError } from '../../shared/ValidationError.js';

export const SHOWTIME_SALES_STATES = Object.freeze([
    'scheduled',
    'on-sale',
    'few-seats',
    'sold-out',
    'closed',
    'cancelled'
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

function normalizeTextList(value, fieldName) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
        throw new ValidationError(`${fieldName} 必须是非空字符串数组`);
    }
    return Object.freeze([...new Set(value.map(item => item.trim()))]);
}

export function createShowtime({
    id,
    movieId,
    cinemaId,
    auditoriumId,
    startsAt,
    endsAt,
    format,
    language,
    subtitle = '',
    accessibilityFeatures = [],
    salesState,
    pricingPolicyId,
    refundPolicyId,
    bookingOpensAt = null,
    bookingClosesAt
}) {
    const normalizedStartsAt = requireIsoDate(startsAt, 'Showtime.startsAt');
    const normalizedEndsAt = requireIsoDate(endsAt, 'Showtime.endsAt');
    const normalizedClosesAt = requireIsoDate(bookingClosesAt, 'Showtime.bookingClosesAt');
    if (Date.parse(normalizedEndsAt) <= Date.parse(normalizedStartsAt)) {
        throw new ValidationError('Showtime.endsAt 必须晚于 startsAt');
    }
    if (Date.parse(normalizedClosesAt) > Date.parse(normalizedStartsAt)) {
        throw new ValidationError('Showtime.bookingClosesAt 不得晚于 startsAt');
    }
    if (bookingOpensAt !== null) {
        requireIsoDate(bookingOpensAt, 'Showtime.bookingOpensAt');
        if (Date.parse(bookingOpensAt) >= Date.parse(normalizedClosesAt)) {
            throw new ValidationError('Showtime.bookingOpensAt 必须早于 bookingClosesAt');
        }
    }
    if (!SHOWTIME_SALES_STATES.includes(salesState)) {
        throw new ValidationError('Showtime.salesState 无效', { salesState });
    }

    return Object.freeze({
        id: requireText(id, 'Showtime.id'),
        movieId: requireText(movieId, 'Showtime.movieId'),
        cinemaId: requireText(cinemaId, 'Showtime.cinemaId'),
        auditoriumId: requireText(auditoriumId, 'Showtime.auditoriumId'),
        startsAt: normalizedStartsAt,
        endsAt: normalizedEndsAt,
        format: requireText(format, 'Showtime.format'),
        language: requireText(language, 'Showtime.language'),
        subtitle: typeof subtitle === 'string' ? subtitle.trim() : '',
        accessibilityFeatures: normalizeTextList(accessibilityFeatures, 'Showtime.accessibilityFeatures'),
        salesState,
        pricingPolicyId: requireText(pricingPolicyId, 'Showtime.pricingPolicyId'),
        refundPolicyId: requireText(refundPolicyId, 'Showtime.refundPolicyId'),
        bookingOpensAt,
        bookingClosesAt: normalizedClosesAt
    });
}
