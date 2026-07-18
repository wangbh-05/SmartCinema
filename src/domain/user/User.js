import { ValidationError } from '../../shared/ValidationError.js';
import { isUserRole } from './UserRole.js';

export function createUser({ id, username, credential, name, email = '', role, createdAt }) {
    if (typeof id !== 'string' || id.length === 0) {
        throw new ValidationError('User id 不能为空');
    }
    if (typeof username !== 'string' || username.trim().length < 3) {
        throw new ValidationError('用户名至少 3 个字符');
    }
    if (!credential || credential.kind !== 'demo-plaintext' || typeof credential.value !== 'string') {
        throw new ValidationError('当前 demo credential 结构无效');
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('姓名不能为空');
    }
    if (!isUserRole(role)) {
        throw new ValidationError('用户角色无效', { role });
    }
    if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
        throw new ValidationError('createdAt 必须是 ISO 时间字符串');
    }

    return Object.freeze({
        id,
        username: username.trim(),
        credential: Object.freeze({ ...credential }),
        name: name.trim(),
        email: typeof email === 'string' ? email.trim() : '',
        role,
        createdAt
    });
}

export function sanitizeUser(user) {
    const { credential, ...safe } = user;
    return Object.freeze({ ...safe });
}

export function canManageUsers(user) {
    return user?.role === 'admin';
}
