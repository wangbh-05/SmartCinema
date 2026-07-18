import { err, ok } from '../../shared/Result.js';
import { createSettings } from '../../domain/user/Settings.js';
import { createUser, sanitizeUser } from '../../domain/user/User.js';

export function registerUser({ stateRepository, clock, idGenerator }, input) {
    const current = stateRepository.read();
    if (!current.ok) return current;

    const username = typeof input?.username === 'string' ? input.username.trim() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (username.length < 3) return err('VALIDATION_ERROR', '用户名至少 3 个字符');
    if (password.length < 6) return err('VALIDATION_ERROR', '密码至少 6 个字符');
    if (name.length === 0) return err('VALIDATION_ERROR', '姓名不能为空');

    const duplicate = Object.values(current.value.usersById).some(user =>
        user.username.toLowerCase() === username.toLowerCase()
    );
    if (duplicate) return err('USERNAME_TAKEN', '用户名已存在');

    const now = clock.now();
    const user = createUser({
        id: idGenerator.next('user'),
        username,
        credential: { kind: 'demo-plaintext', value: password },
        name,
        email: input.email || '',
        role: 'member',
        createdAt: now
    });
    const updated = stateRepository.update(current.value.revision, draft => {
        draft.usersById[user.id] = user;
        draft.settingsByUser[user.id] = createSettings(draft.settingsByUser.guest);
        draft.session = { userId: user.id, loginAt: now };
    });
    if (!updated.ok) return updated;
    return ok({ user: sanitizeUser(user), state: updated.value });
}
