import { err, ok } from '../../shared/Result.js';
import { cloneJson, deepFreeze, isPlainObject } from '../../shared/objects.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { createSeatInventory } from '../../domain/cinema/SeatInventory.js';
import { rehydrateOrder } from '../../domain/order/Order.js';
import { createSettings } from '../../domain/user/Settings.js';
import { createUser } from '../../domain/user/User.js';

export const STATE_SCHEMA_VERSION = 2;

function requireIsoDate(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${fieldName} 必须是 ISO 时间字符串`);
    }
}

function requirePlainMap(value, fieldName) {
    if (!isPlainObject(value)) {
        throw new ValidationError(`${fieldName} 必须是 plain object`);
    }
    return value;
}

function validateMigration(value) {
    requirePlainMap(value, 'migration');
    if (value.fromVersion !== null && value.fromVersion !== 1) {
        throw new ValidationError('migration.fromVersion 无效');
    }
    if (value.completedAt !== null) requireIsoDate(value.completedAt, 'migration.completedAt');
    if (!Array.isArray(value.warnings) || value.warnings.some(item => typeof item !== 'string')) {
        throw new ValidationError('migration.warnings 必须是字符串数组');
    }
    return Object.freeze({
        fromVersion: value.fromVersion,
        completedAt: value.completedAt,
        warnings: Object.freeze([...value.warnings])
    });
}

export function createDefaultAdmin(now) {
    return createUser({
        id: 'admin_001',
        username: 'admin',
        credential: { kind: 'demo-plaintext', value: 'admin123' },
        name: '系统管理员',
        email: 'admin@smartcinema.com',
        role: 'admin',
        createdAt: now
    });
}

export function createDefaultState(now, admin = createDefaultAdmin(now)) {
    const state = {
        schemaVersion: STATE_SCHEMA_VERSION,
        revision: 0,
        updatedAt: now,
        usersById: { [admin.id]: admin },
        session: null,
        ordersById: {},
        inventoriesByShowtime: {},
        settingsByUser: { guest: createSettings() },
        migration: { fromVersion: null, completedAt: null, warnings: [] }
    };
    const result = validateStateEnvelope(state);
    if (!result.ok) throw new ValidationError(result.error.message, result.error.details);
    return result.value;
}

export function validateStateEnvelope(input) {
    try {
        const data = cloneJson(input);
        requirePlainMap(data, 'state');
        if (data.schemaVersion !== STATE_SCHEMA_VERSION) {
            throw new ValidationError('state schemaVersion 必须为 2');
        }
        if (!Number.isInteger(data.revision) || data.revision < 0) {
            throw new ValidationError('state revision 必须是非负整数');
        }
        requireIsoDate(data.updatedAt, 'updatedAt');

        const usersInput = requirePlainMap(data.usersById, 'usersById');
        const usersById = {};
        const usernames = new Set();
        Object.entries(usersInput).forEach(([key, userData]) => {
            const user = createUser(userData);
            if (key !== user.id) throw new ValidationError('usersById key 与 user.id 不一致', { key });
            const normalizedUsername = user.username.toLowerCase();
            if (usernames.has(normalizedUsername)) {
                throw new ValidationError('用户名不得重复', { username: user.username });
            }
            usernames.add(normalizedUsername);
            usersById[key] = user;
        });

        let session = null;
        if (data.session !== null) {
            requirePlainMap(data.session, 'session');
            if (!usersById[data.session.userId] || usersById[data.session.userId].role === 'system') {
                throw new ValidationError('session.userId 未引用可登录用户');
            }
            requireIsoDate(data.session.loginAt, 'session.loginAt');
            session = Object.freeze({ userId: data.session.userId, loginAt: data.session.loginAt });
        }

        const inventoriesInput = requirePlainMap(data.inventoriesByShowtime, 'inventoriesByShowtime');
        const inventoriesByShowtime = {};
        Object.entries(inventoriesInput).forEach(([key, inventoryData]) => {
            const inventory = createSeatInventory(inventoryData);
            if (key !== inventory.showtimeId) {
                throw new ValidationError('inventory map key 与 showtimeId 不一致', { key });
            }
            inventoriesByShowtime[key] = inventory;
        });

        const ordersInput = requirePlainMap(data.ordersById, 'ordersById');
        const ordersById = {};
        const idempotencyKeys = new Set();
        Object.entries(ordersInput).forEach(([key, orderData]) => {
            const order = rehydrateOrder(orderData);
            if (key !== order.id) throw new ValidationError('ordersById key 与 order.id 不一致', { key });
            if (!usersById[order.userId]) throw new ValidationError('订单引用不存在的 userId', { orderId: order.id });
            if (idempotencyKeys.has(order.idempotencyKey)) {
                throw new ValidationError('订单 idempotencyKey 不得重复', { idempotencyKey: order.idempotencyKey });
            }
            idempotencyKeys.add(order.idempotencyKey);
            if (order.status === 'confirmed') {
                const inventory = inventoriesByShowtime[order.showtimeId];
                if (!inventory) throw new ValidationError('confirmed 订单缺少对应库存', { orderId: order.id });
                const sold = new Set(inventory.soldSeatKeys);
                const missing = order.seats.filter(seat => !sold.has(seat.seatKey));
                if (missing.length > 0) {
                    throw new ValidationError('confirmed 订单座位未写入库存', { orderId: order.id });
                }
            }
            ordersById[key] = order;
        });

        const settingsInput = requirePlainMap(data.settingsByUser, 'settingsByUser');
        if (!settingsInput.guest) throw new ValidationError('settingsByUser.guest 必须存在');
        const settingsByUser = {};
        Object.entries(settingsInput).forEach(([key, settings]) => {
            if (key !== 'guest' && !usersById[key]) {
                throw new ValidationError('settings 引用不存在的用户', { userId: key });
            }
            settingsByUser[key] = createSettings(settings);
        });

        return ok(deepFreeze({
            schemaVersion: STATE_SCHEMA_VERSION,
            revision: data.revision,
            updatedAt: data.updatedAt,
            usersById,
            session,
            ordersById,
            inventoriesByShowtime,
            settingsByUser,
            migration: validateMigration(data.migration)
        }));
    } catch (error) {
        const details = error instanceof ValidationError ? error.details : {};
        return err('STORAGE_CORRUPTED', error.message, details);
    }
}
