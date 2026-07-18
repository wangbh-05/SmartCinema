import { ok } from '../../shared/Result.js';

export function logoutUser({ stateRepository, checkoutIntentRepository = null }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const updated = stateRepository.update(current.value.revision, draft => {
        draft.session = null;
    });
    if (!updated.ok) return updated;
    if (checkoutIntentRepository) checkoutIntentRepository.clear();
    return ok({ state: updated.value });
}
