import { err, ok } from '../../shared/Result.js';
import { sanitizeUser } from '../../domain/user/User.js';

export function listUsers({ stateRepository }) {
    const current = stateRepository.read();
    if (!current.ok) return current;
    const userId = current.value.session?.userId;
    if (!userId) return err('AUTH_REQUIRED', '请先登录');
    const currentUser = current.value.usersById[userId];
    if (currentUser?.role !== 'admin') return err('FORBIDDEN', '无权查看用户列表');

    const users = Object.values(current.value.usersById)
        .filter(user => user.role !== 'system')
        .map(sanitizeUser)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return ok(Object.freeze(users));
}
