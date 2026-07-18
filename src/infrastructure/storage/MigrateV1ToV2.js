import { err, ok } from '../../shared/Result.js';
import { cloneJson } from '../../shared/objects.js';
import { ValidationError } from '../../shared/ValidationError.js';
import { parseSeatKey } from '../../domain/cinema/Seat.js';
import { createSeatInventory, sellSeats } from '../../domain/cinema/SeatInventory.js';
import { createShowtimeId, isDayIndex } from '../../domain/cinema/Showtime.js';
import { createCheckoutIntent } from '../../domain/order/CheckoutIntent.js';
import { cancelOrder, createConfirmedOrder } from '../../domain/order/Order.js';
import { createSettings } from '../../domain/user/Settings.js';
import { createUser } from '../../domain/user/User.js';
import {
    LocalStateRepository,
    STATE_STORAGE_KEY
} from './LocalStateRepository.js';
import { SessionCheckoutIntentRepository } from './SessionCheckoutIntentRepository.js';
import {
    createDefaultAdmin,
    createDefaultState,
    validateStateEnvelope
} from './StorageValidator.js';

export const MIGRATION_BACKUP_KEY = 'smartcinema_migration_backup_v1';
export const MIGRATION_REPORT_KEY = 'smartcinema_migration_report_v2';
export const MIGRATION_CANDIDATE_KEY = 'smartcinema_state_v2_candidate';

const LEGACY_LOCAL_KEYS = Object.freeze([
    'smartcinema_users',
    'smartcinema_session',
    'smartcinema_orders',
    'smartcinema_sold_seats',
    'smartcinema_seat_selection',
    'smartcinema_settings'
]);

const LEGACY_SESSION_KEYS = Object.freeze(['smartcinema_order_summary']);

function parseOptionalJson(raw, key, warnings, fallback = null) {
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        warnings.push(`${key} JSON 损坏：${error.message}`);
        return fallback;
    }
}

function asIsoDate(value, fallback) {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
    if (typeof value === 'number' && !Number.isNaN(new Date(value).getTime())) return new Date(value).toISOString();
    return fallback;
}

function findUniqueOwner(order, usersById) {
    if (typeof order.userId === 'string' && usersById[order.userId]) return usersById[order.userId];
    const users = Object.values(usersById).filter(user => user.role !== 'system');
    const email = order.userInfo?.email?.trim().toLowerCase();
    if (email) {
        const matches = users.filter(user => user.email.toLowerCase() === email);
        if (matches.length === 1) return matches[0];
    }
    const name = order.userInfo?.name?.trim();
    if (name) {
        const matches = users.filter(user => user.name === name);
        if (matches.length === 1) return matches[0];
    }
    return null;
}

export class V1ToV2Migration {
    constructor({ localStorage, sessionStorage, clock, idGenerator }) {
        if (!localStorage || !sessionStorage) throw new TypeError('迁移器需要 localStorage/sessionStorage');
        if (!clock || typeof clock.now !== 'function') throw new TypeError('迁移器需要 Clock');
        if (!idGenerator || typeof idGenerator.next !== 'function') throw new TypeError('迁移器需要 IdGenerator');
        this.localStorage = localStorage;
        this.sessionStorage = sessionStorage;
        this.clock = clock;
        this.idGenerator = idGenerator;
    }

    run() {
        const repository = new LocalStateRepository({ storage: this.localStorage, clock: this.clock });
        const existing = repository.read();
        if (existing.ok) return ok({ migrated: false, state: existing.value, report: null });
        if (existing.error.code !== 'MIGRATION_REQUIRED') return existing;

        const now = this.clock.now();
        const rawLocal = Object.fromEntries(LEGACY_LOCAL_KEYS.map(key => [key, this.localStorage.getItem(key)]));
        const rawSession = Object.fromEntries(LEGACY_SESSION_KEYS.map(key => [key, this.sessionStorage.getItem(key)]));
        const hasLegacyData = [...Object.values(rawLocal), ...Object.values(rawSession)].some(value => value !== null);
        const backup = {
            backupVersion: 1,
            createdAt: now,
            localStorage: rawLocal,
            sessionStorage: rawSession
        };

        if (this.localStorage.getItem(MIGRATION_BACKUP_KEY) === null) {
            try {
                this.localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(backup));
            } catch (error) {
                return err('STORAGE_WRITE_FAILED', '无法创建 v1 迁移备份', { reason: error.message });
            }
        }

        const warnings = [];
        const report = {
            schemaVersion: 2,
            createdAt: now,
            migratedUsers: 0,
            migratedOrders: 0,
            quarantinedUsers: [],
            quarantinedOrders: [],
            legacyUnscopedSoldSeatsByHall: {},
            warnings
        };

        const usersResult = this._migrateUsers(rawLocal.smartcinema_users, now, report);
        if (!usersResult.ok) return usersResult;
        const usersById = usersResult.value;
        const state = cloneJson(createDefaultState(now, this._ensureAdmin(usersById, now)));
        state.usersById = usersById;
        state.migration = {
            fromVersion: hasLegacyData ? 1 : null,
            completedAt: hasLegacyData ? now : null,
            warnings
        };

        this._migrateSession(rawLocal.smartcinema_session, usersById, state, warnings, now);
        this._migrateSettings(rawLocal.smartcinema_settings, state, warnings);
        this._quarantineSoldSeats(rawLocal.smartcinema_sold_seats, report);
        this._migrateOrders(rawLocal.smartcinema_orders, state, report, now);
        if (rawLocal.smartcinema_seat_selection !== null) {
            warnings.push('v1 seat_selection 缺少可靠 showtime，已丢弃临时选择');
        }

        const checkoutIntent = this._migrateCheckoutIntent(
            rawSession.smartcinema_order_summary,
            state,
            warnings,
            now
        );
        const validated = validateStateEnvelope(state);
        if (!validated.ok) return validated;

        try {
            this.localStorage.setItem(MIGRATION_CANDIDATE_KEY, JSON.stringify(validated.value));
            const candidateRaw = this.localStorage.getItem(MIGRATION_CANDIDATE_KEY);
            const candidate = validateStateEnvelope(JSON.parse(candidateRaw));
            if (!candidate.ok) return candidate;

            const initialized = repository.initialize(candidate.value);
            if (!initialized.ok) return initialized;

            if (checkoutIntent) {
                const checkoutRepository = new SessionCheckoutIntentRepository({ storage: this.sessionStorage });
                const saved = checkoutRepository.save(checkoutIntent);
                if (!saved.ok) warnings.push('合法 v1 order summary 未能保存为 CheckoutIntent');
            }

            this.localStorage.setItem(MIGRATION_REPORT_KEY, JSON.stringify(report));
            return ok({ migrated: hasLegacyData, state: initialized.value, report });
        } catch (error) {
            if (this.localStorage.getItem(STATE_STORAGE_KEY) !== null) {
                return err('STORAGE_WRITE_FAILED', 'v2 state 已写入，但迁移报告未完整保存', { reason: error.message });
            }
            return err('STORAGE_WRITE_FAILED', '无法提交 v2 migration candidate', { reason: error.message });
        } finally {
            try {
                this.localStorage.removeItem(MIGRATION_CANDIDATE_KEY);
            } catch (error) {
                // candidate 永远不是正式事实源，删除失败只保留无害残留。
            }
        }
    }

    _migrateUsers(raw, now, report) {
        if (raw !== null) {
            try {
                JSON.parse(raw);
            } catch (error) {
                return err('STORAGE_CORRUPTED', 'v1 users JSON 损坏，迁移已停止', { reason: error.message });
            }
        }
        const users = raw === null ? [] : JSON.parse(raw);
        if (!Array.isArray(users)) return err('STORAGE_CORRUPTED', 'v1 users 必须是数组');

        const usersById = {};
        const usernames = new Set();
        users.forEach((legacy, index) => {
            try {
                const username = typeof legacy.username === 'string' ? legacy.username.trim() : '';
                const normalized = username.toLowerCase();
                if (usernames.has(normalized)) {
                    report.quarantinedUsers.push({ index, username, reason: 'duplicate-username' });
                    return;
                }
                const user = createUser({
                    id: legacy.id || this.idGenerator.next('user'),
                    username,
                    credential: { kind: 'demo-plaintext', value: legacy.password || '' },
                    name: legacy.name,
                    email: legacy.email || '',
                    role: legacy.role || 'member',
                    createdAt: asIsoDate(legacy.createdAt, now)
                });
                if (usersById[user.id]) {
                    report.quarantinedUsers.push({ index, username, reason: 'duplicate-id' });
                    return;
                }
                usernames.add(normalized);
                usersById[user.id] = user;
                report.migratedUsers++;
            } catch (error) {
                report.quarantinedUsers.push({
                    index,
                    username: typeof legacy?.username === 'string' ? legacy.username : '',
                    reason: error.message
                });
            }
        });
        return ok(usersById);
    }

    _ensureAdmin(usersById, now) {
        const existing = Object.values(usersById).find(user => user.role === 'admin');
        if (existing) return existing;
        const admin = createDefaultAdmin(now);
        if (usersById[admin.id]) {
            const replacement = createUser({
                ...admin,
                id: this.idGenerator.next('admin')
            });
            usersById[replacement.id] = replacement;
            return replacement;
        }
        usersById[admin.id] = admin;
        return admin;
    }

    _migrateSession(raw, usersById, state, warnings, now) {
        const legacy = parseOptionalJson(raw, 'smartcinema_session', warnings);
        if (!legacy?.username) return;
        const user = Object.values(usersById).find(candidate => candidate.username === legacy.username);
        if (!user || user.role === 'system') {
            warnings.push('v1 session 无法匹配用户，已清除');
            return;
        }
        state.session = {
            userId: user.id,
            loginAt: asIsoDate(legacy.loginTime, now)
        };
    }

    _migrateSettings(raw, state, warnings) {
        const legacy = parseOptionalJson(raw, 'smartcinema_settings', warnings, {});
        try {
            state.settingsByUser.guest = createSettings({
                theme: legacy.darkMode === undefined ? 'dark' : (legacy.darkMode ? 'dark' : 'light'),
                accessibilityMode: legacy.accessibilityMode ?? false,
                colorblindMode: legacy.colorblindMode ?? false,
                voiceEnabled: legacy.voiceEnabled ?? false,
                realtimeEnabled: legacy.realtimeEnabled ?? false,
                accentColor: legacy.accentColor || '#58A6FF',
                reducedMotion: 'system',
                language: legacy.language || 'zh-CN'
            });
        } catch (error) {
            warnings.push(`v1 settings 无效，已使用默认值：${error.message}`);
        }
    }

    _quarantineSoldSeats(raw, report) {
        const legacy = parseOptionalJson(raw, 'smartcinema_sold_seats', report.warnings, {});
        if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return;
        Object.entries(legacy).forEach(([hallType, seatKeys]) => {
            if (!['small', 'medium', 'large'].includes(hallType) || !Array.isArray(seatKeys)) {
                report.warnings.push(`v1 sold seats 的 ${hallType} 结构无效`);
                return;
            }
            const valid = [];
            seatKeys.forEach(seatKey => {
                try {
                    parseSeatKey(seatKey, hallType);
                    if (!valid.includes(seatKey)) valid.push(seatKey);
                } catch (error) {
                    report.warnings.push(`v1 sold seat ${hallType}/${seatKey} 无效`);
                }
            });
            if (valid.length > 0) report.legacyUnscopedSoldSeatsByHall[hallType] = valid;
        });
    }

    _migrateOrders(raw, state, report, now) {
        const legacyOrders = parseOptionalJson(raw, 'smartcinema_orders', report.warnings, []);
        if (!Array.isArray(legacyOrders)) {
            report.warnings.push('v1 orders 不是数组，已整体 quarantine');
            return;
        }

        legacyOrders.forEach((legacy, index) => {
            const legacyId = legacy?.id || `index-${index}`;
            try {
                const owner = findUniqueOwner(legacy, state.usersById);
                if (!owner) throw new ValidationError('owner-unresolved');
                if (!['small', 'medium', 'large'].includes(legacy.hallType) || !isDayIndex(legacy.dayIndex)) {
                    throw new ValidationError('showtime-unresolved');
                }
                if (!['confirmed', 'cancelled'].includes(legacy.status)) {
                    throw new ValidationError('unsupported-status');
                }
                const showtimeId = createShowtimeId(legacy.hallType, legacy.dayIndex);
                const createdAt = asIsoDate(legacy.timestamp, now);
                const seats = (legacy.seats || []).map(seat => ({
                    seatKey: `${seat.row}-${seat.col}`,
                    row: seat.row,
                    col: seat.col,
                    unitPrice: seat.unitPrice ?? seat.price
                }));
                let order = createConfirmedOrder({
                    id: legacy.id || this.idGenerator.next('order'),
                    idempotencyKey: legacy.idempotencyKey || `legacy:${legacy.id || index}`,
                    userId: owner.id,
                    showtimeId,
                    seats,
                    createdAt,
                    confirmedAt: asIsoDate(legacy.confirmTime || legacy.paymentTime, createdAt)
                });
                if (legacy.totalPrice !== undefined && legacy.totalPrice !== order.totalPrice) {
                    throw new ValidationError('total-price-mismatch');
                }
                if (state.ordersById[order.id]) throw new ValidationError('duplicate-order-id');
                if (Object.values(state.ordersById).some(existing =>
                    existing.idempotencyKey === order.idempotencyKey
                )) {
                    throw new ValidationError('duplicate-idempotency-key');
                }

                if (legacy.status === 'cancelled') {
                    const cancelled = cancelOrder(order, {
                        cancelledAt: asIsoDate(legacy.cancelTime, now),
                        reason: legacy.cancelReason || 'legacy cancellation'
                    });
                    if (!cancelled.ok) throw new ValidationError(cancelled.error.message);
                    order = cancelled.value;
                } else {
                    const current = state.inventoriesByShowtime[showtimeId] || createSeatInventory({
                        showtimeId,
                        revision: 0,
                        soldSeatKeys: [],
                        updatedAt: createdAt
                    });
                    const sold = sellSeats(current, order.seats.map(seat => seat.seatKey), order.confirmedAt);
                    if (!sold.ok) throw new ValidationError('inventory-conflict');
                    state.inventoriesByShowtime[showtimeId] = sold.value;
                }

                state.ordersById[order.id] = order;
                report.migratedOrders++;
            } catch (error) {
                report.quarantinedOrders.push({ legacyId, reason: error.message });
            }
        });
    }

    _migrateCheckoutIntent(raw, state, warnings, now) {
        const legacy = parseOptionalJson(raw, 'smartcinema_order_summary', warnings);
        if (!legacy) return null;
        try {
            if (!state.session?.userId) throw new ValidationError('order summary 缺少登录用户');
            if (!['small', 'medium', 'large'].includes(legacy.hallType) || !isDayIndex(legacy.dayIndex)) {
                throw new ValidationError('order summary 场次无效');
            }
            const createdAt = asIsoDate(legacy.timestamp, now);
            const expiresAt = new Date(Date.parse(createdAt) + 15 * 60 * 1000).toISOString();
            if (Date.parse(expiresAt) <= Date.parse(now)) throw new ValidationError('order summary 已过期');
            return createCheckoutIntent({
                id: this.idGenerator.next('checkout'),
                userId: state.session.userId,
                showtimeId: createShowtimeId(legacy.hallType, legacy.dayIndex),
                seats: (legacy.seats || []).map(seat => ({
                    seatKey: `${seat.row}-${seat.col}`,
                    row: seat.row,
                    col: seat.col,
                    unitPrice: seat.unitPrice ?? seat.price
                })),
                inventoryRevision: 0,
                createdAt,
                expiresAt
            });
        } catch (error) {
            warnings.push(`v1 order summary 未迁移：${error.message}`);
            return null;
        }
    }
}

export default V1ToV2Migration;
