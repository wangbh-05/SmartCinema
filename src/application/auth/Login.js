import { err, ok } from '../../shared/Result.js';
import { sanitizeUser } from '../../domain/user/User.js';

export function loginUser({ stateRepository, clock }, { username, password }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const user = Object.values(current.value.usersById).find(candidate =>
        candidate.role !== 'system' && candidate.username.toLowerCase() === normalized
    );
    if (!user || user.credential.value !== password) {
        return err('INVALID_CREDENTIALS', '用户名或密码错误');
    }

    const now = clock.now();
    const updated = stateRepository.update(current.value.revision, draft => {
        draft.session = { userId: user.id, loginAt: now };
    });
    if (!updated.ok) return updated;
    return ok({ user: sanitizeUser(user), state: updated.value });
}
