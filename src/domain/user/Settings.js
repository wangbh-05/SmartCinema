import { ValidationError } from '../../shared/ValidationError.js';

export const DEFAULT_SETTINGS = Object.freeze({
    theme: 'dark',
    accessibilityMode: false,
    colorblindMode: false,
    voiceEnabled: false,
    realtimeEnabled: false,
    accentColor: '#58A6FF',
    reducedMotion: 'system',
    language: 'zh-CN'
});

const THEMES = Object.freeze(['light', 'dark', 'system']);
const MOTION_PREFERENCES = Object.freeze(['system', 'reduce', 'no-preference']);
const ACCENT_PATTERN = /^#[0-9A-F]{6}$/i;

export function createSettings(input = {}) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new ValidationError('settings 必须是对象');
    }
    const settings = { ...DEFAULT_SETTINGS, ...input };

    if (!THEMES.includes(settings.theme)) {
        throw new ValidationError('theme 无效', { theme: settings.theme });
    }
    ['accessibilityMode', 'colorblindMode', 'voiceEnabled', 'realtimeEnabled'].forEach(key => {
        if (typeof settings[key] !== 'boolean') {
            throw new ValidationError(`${key} 必须是 boolean`, { [key]: settings[key] });
        }
    });
    if (typeof settings.accentColor !== 'string' || !ACCENT_PATTERN.test(settings.accentColor)) {
        throw new ValidationError('accentColor 必须是六位十六进制颜色', { accentColor: settings.accentColor });
    }
    if (!MOTION_PREFERENCES.includes(settings.reducedMotion)) {
        throw new ValidationError('reducedMotion 无效', { reducedMotion: settings.reducedMotion });
    }
    if (typeof settings.language !== 'string' || settings.language.trim().length === 0) {
        throw new ValidationError('language 不能为空');
    }

    return Object.freeze({
        theme: settings.theme,
        accessibilityMode: settings.accessibilityMode,
        colorblindMode: settings.colorblindMode,
        voiceEnabled: settings.voiceEnabled,
        realtimeEnabled: settings.realtimeEnabled,
        accentColor: settings.accentColor.toUpperCase(),
        reducedMotion: settings.reducedMotion,
        language: settings.language.trim()
    });
}
