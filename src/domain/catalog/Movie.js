import { ValidationError } from '../../shared/ValidationError.js';

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function normalizeTextList(value, fieldName) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
        throw new ValidationError(`${fieldName} 必须是非空字符串数组`);
    }
    return Object.freeze([...new Set(value.map(item => item.trim()))]);
}

export function createMovie({
    id,
    title,
    originalTitle = '',
    durationMinutes,
    audienceRating = '未分级',
    genres = [],
    synopsis = '',
    artwork = null
}) {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        throw new ValidationError('电影时长必须是正整数分钟', { durationMinutes });
    }
    if (artwork !== null && (typeof artwork !== 'string' || artwork.trim().length === 0)) {
        throw new ValidationError('artwork 必须是非空字符串或 null');
    }

    return Object.freeze({
        id: requireText(id, 'Movie.id'),
        title: requireText(title, 'Movie.title'),
        originalTitle: typeof originalTitle === 'string' ? originalTitle.trim() : '',
        durationMinutes,
        audienceRating: requireText(audienceRating, 'Movie.audienceRating'),
        genres: normalizeTextList(genres, 'Movie.genres'),
        synopsis: typeof synopsis === 'string' ? synopsis.trim() : '',
        artwork: artwork === null ? null : artwork.trim()
    });
}
