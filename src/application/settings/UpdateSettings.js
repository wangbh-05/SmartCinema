import { err, ok } from '../../shared/Result.js';
import { createSettings } from '../../domain/user/Settings.js';

export function updateSettings({ stateRepository }, patch) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const settingsKey = current.value.session?.userId || 'guest';
    const base = current.value.settingsByUser[settingsKey] || current.value.settingsByUser.guest;
    let settings;
    try {
        settings = createSettings({ ...base, ...patch });
    } catch (error) {
        return err('VALIDATION_ERROR', error.message);
    }
    const updated = stateRepository.update(current.value.revision, draft => {
        draft.settingsByUser[settingsKey] = settings;
    });
    if (!updated.ok) return updated;
    return ok({ settings, state: updated.value });
}
