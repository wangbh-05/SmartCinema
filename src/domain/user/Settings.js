import { ValidationError } from '../../shared/ValidationError.js';

export const DEFAULT_SETTINGS = Object.freeze({
    accessibilityMode: false,
    highContrastMode: false,
    colorblindMode: false,
    reducedMotion: 'system'
});

const MOTION_PREFERENCES = Object.freeze(['system', 'reduce']);

export function createSettings(input = {}) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new ValidationError('settings 必须是对象');
    }
    const settings = { ...DEFAULT_SETTINGS, ...input };

    ['accessibilityMode', 'highContrastMode', 'colorblindMode'].forEach(key => {
        if (typeof settings[key] !== 'boolean') {
            throw new ValidationError(`${key} 必须是 boolean`, { [key]: settings[key] });
        }
    });
    if (!MOTION_PREFERENCES.includes(settings.reducedMotion)) {
        throw new ValidationError('reducedMotion 无效', { reducedMotion: settings.reducedMotion });
    }

    return Object.freeze({
        accessibilityMode: settings.accessibilityMode,
        highContrastMode: settings.highContrastMode,
        colorblindMode: settings.colorblindMode,
        reducedMotion: settings.reducedMotion
    });
}
