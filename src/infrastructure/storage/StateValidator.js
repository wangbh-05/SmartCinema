import { createShowtimeInventory } from '../../domain/booking/ShowtimeInventory.js';
import { rehydrateSeatHold } from '../../domain/booking/SeatHold.js';
import { rehydrateTicketOrder } from '../../domain/order/TicketOrder.js';
import { createSettings } from '../../domain/user/Settings.js';
import { createUser } from '../../domain/user/User.js';
import { err, ok } from '../../shared/Result.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { cloneJson, deepFreeze, isPlainObject } from '../../shared/objects.js';

export const STATE_SCHEMA_VERSION = 3;

function requireIsoDate(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${fieldName} 必须是 ISO 时间字符串`);
    }
    return value;
}

function requirePlainMap(value, fieldName) {
    if (!isPlainObject(value)) throw new ValidationError(`${fieldName} 必须是 plain object`);
    return value;
}

export function validateState(input) {
    try {
        const data = cloneJson(input);
        requirePlainMap(data, 'state');
        if (data.schemaVersion !== STATE_SCHEMA_VERSION) {
            throw new ValidationError('state schemaVersion 必须为 3');
        }
        if (!Number.isInteger(data.revision) || data.revision < 0) {
            throw new ValidationError('state revision 必须是非负整数');
        }
        requireIsoDate(data.updatedAt, 'updatedAt');

        const usersById = {};
        const usernames = new Set();
        Object.entries(requirePlainMap(data.usersById, 'usersById')).forEach(([key, userData]) => {
            const user = createUser(userData);
            if (key !== user.id) throw new ValidationError('usersById key 与 user.id 不一致', { key });
            const normalizedUsername = user.username.toLowerCase();
            if (usernames.has(normalizedUsername)) throw new ValidationError('用户名不得重复');
            usernames.add(normalizedUsername);
            usersById[key] = user;
        });

        let session = null;
        if (data.session !== null) {
            requirePlainMap(data.session, 'session');
            if (!usersById[data.session.userId]) throw new ValidationError('session.userId 未引用用户');
            session = Object.freeze({
                userId: data.session.userId,
                loginAt: requireIsoDate(data.session.loginAt, 'session.loginAt')
            });
        }

        const inventoriesByShowtime = {};
        Object.entries(requirePlainMap(data.inventoriesByShowtime, 'inventoriesByShowtime'))
            .forEach(([key, inventoryData]) => {
                const inventory = createShowtimeInventory(inventoryData);
                if (key !== inventory.showtimeId) {
                    throw new ValidationError('inventory map key 与 showtimeId 不一致', { key });
                }
                inventoriesByShowtime[key] = inventory;
            });

        const holdsById = {};
        const holdIdempotencyKeys = new Set();
        Object.entries(requirePlainMap(data.holdsById, 'holdsById')).forEach(([key, holdData]) => {
            const hold = rehydrateSeatHold(holdData);
            if (key !== hold.id) throw new ValidationError('holdsById key 与 hold.id 不一致', { key });
            if (holdIdempotencyKeys.has(hold.idempotencyKey)) {
                throw new ValidationError('SeatHold idempotencyKey 不得重复');
            }
            if (!usersById[hold.ownerId] && !hold.ownerId.startsWith('guest:')) {
                throw new ValidationError('SeatHold.ownerId 未引用用户或访客会话', { holdId: hold.id });
            }
            if (!inventoriesByShowtime[hold.showtimeId]) {
                throw new ValidationError('SeatHold 缺少对应库存', { holdId: hold.id });
            }
            holdIdempotencyKeys.add(hold.idempotencyKey);
            holdsById[key] = hold;
        });

        const ordersById = {};
        const orderIdempotencyKeys = new Set();
        Object.entries(requirePlainMap(data.ordersById, 'ordersById')).forEach(([key, orderData]) => {
            const order = rehydrateTicketOrder(orderData);
            if (key !== order.id) throw new ValidationError('ordersById key 与 order.id 不一致', { key });
            if (!usersById[order.userId]) throw new ValidationError('订单引用不存在的 userId', { orderId: order.id });
            if (orderIdempotencyKeys.has(order.idempotencyKey)) {
                throw new ValidationError('订单 idempotencyKey 不得重复');
            }
            const inventory = inventoriesByShowtime[order.showtimeSnapshot.id];
            if (order.status === 'confirmed') {
                if (!inventory) throw new ValidationError('confirmed 订单缺少对应库存', { orderId: order.id });
                const sold = new Set(inventory.soldSeatIds);
                const missing = order.seatSnapshots.filter(seat => !sold.has(seat.id));
                if (missing.length > 0) {
                    throw new ValidationError('confirmed 订单座位未写入库存', { orderId: order.id });
                }
            }
            orderIdempotencyKeys.add(order.idempotencyKey);
            ordersById[key] = order;
        });

        Object.values(holdsById).forEach(hold => {
            const inventory = inventoriesByShowtime[hold.showtimeId];
            const mappedSeatIds = Object.entries(inventory.holdIdsBySeatId)
                .filter(([, holdId]) => holdId === hold.id)
                .map(([seatId]) => seatId)
                .sort();
            const expectedSeatIds = [...hold.seatIds].sort();
            if (hold.status === 'held') {
                if (JSON.stringify(mappedSeatIds) !== JSON.stringify(expectedSeatIds)) {
                    throw new ValidationError('held SeatHold 与库存映射不一致', { holdId: hold.id });
                }
            } else if (mappedSeatIds.length > 0) {
                throw new ValidationError('非 held SeatHold 不得占用库存', { holdId: hold.id });
            }
            if (hold.status === 'consumed') {
                const order = ordersById[hold.consumedOrderId];
                if (!order || order.sourceHoldId !== hold.id) {
                    throw new ValidationError('consumed SeatHold 缺少对应订单', { holdId: hold.id });
                }
            }
        });

        Object.values(inventoriesByShowtime).forEach(inventory => {
            Object.entries(inventory.holdIdsBySeatId).forEach(([seatId, holdId]) => {
                const hold = holdsById[holdId];
                if (!hold || hold.status !== 'held' || hold.showtimeId !== inventory.showtimeId ||
                    !hold.seatIds.includes(seatId)) {
                    throw new ValidationError('库存引用无效 SeatHold', { seatId, holdId });
                }
            });
        });

        const settingsByUser = {};
        const settingsInput = requirePlainMap(data.settingsByUser, 'settingsByUser');
        if (!settingsInput.guest) throw new ValidationError('settingsByUser.guest 必须存在');
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
            holdsById,
            settingsByUser
        }));
    } catch (error) {
        const details = error instanceof ValidationError ? error.details : {};
        return err('STORAGE_CORRUPTED', error.message, details);
    }
}
