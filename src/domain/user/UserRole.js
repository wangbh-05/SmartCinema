export const USER_ROLE = Object.freeze({
    MEMBER: 'member',
    ADMIN: 'admin',
    SYSTEM: 'system'
});

export function isUserRole(value) {
    return Object.values(USER_ROLE).includes(value);
}
