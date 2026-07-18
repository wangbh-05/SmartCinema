import { createMoney } from '../../domain/Money.js';
import { createShowtimeInventory } from '../../domain/booking/ShowtimeInventory.js';
import { rehydrateCommercialOrder } from '../../domain/order/CommercialOrder.js';
import { formatSeatLabel, parseSeatKey } from '../../domain/cinema/Seat.js';
import { parseShowtimeId } from '../../domain/cinema/Showtime.js';
import { err, ok } from '../../shared/Result.js';
import { cloneJson } from '../../shared/objects.js';
import { validateStateEnvelope } from './StorageValidator.js';
import { validateStateEnvelopeV3 } from './StorageValidatorV3.js';
import { STATE_STORAGE_KEY_V3 } from './LocalStateRepositoryV3.js';

export const STATE_STORAGE_KEY_V2 = 'smartcinema_state_v2';
export const V2_BACKUP_BEFORE_V3_KEY = 'smartcinema_state_v2_backup_before_v3';

function legacyShowtimeId(v2ShowtimeId) {
    return `legacy-showtime:${v2ShowtimeId}`;
}

function legacyAuditoriumName(v2ShowtimeId) {
    return parseShowtimeId(v2ShowtimeId).hall.name;
}

function mapInventory(inventory) {
    return createShowtimeInventory({
        showtimeId: legacyShowtimeId(inventory.showtimeId),
        revision: inventory.revision,
        soldSeatIds: inventory.soldSeatKeys,
        holdIdsBySeatId: {},
        updatedAt: inventory.updatedAt
    });
}

function mapOrder(order) {
    const amount = order.totalPrice * 100;
    const currency = order.currency;
    const showtimeId = legacyShowtimeId(order.showtimeId);
    const seatSnapshots = order.seats.map(seat => {
        const parsed = parseSeatKey(seat.seatKey);
        return {
            id: seat.seatKey,
            label: formatSeatLabel(seat.seatKey),
            rowLabel: String(parsed.row + 1),
            seatNumber: parsed.col + 1,
            sectionId: 'legacy-main',
            zoneId: 'legacy-unknown',
            kind: 'standard',
            stepFree: false
        };
    });
    const zero = createMoney(0, currency);
    const total = createMoney(amount, currency);
    const migrated = {
        schemaVersion: 3,
        id: order.id,
        idempotencyKey: order.idempotencyKey,
        userId: order.userId,
        sourceHoldId: null,
        legacySource: {
            sourceSchemaVersion: 2,
            sourceShowtimeId: order.showtimeId
        },
        status: order.status,
        movieSnapshot: {
            id: 'legacy-movie:unknown',
            title: '历史订单（影片信息未记录）',
            originalTitle: '',
            durationMinutes: null,
            audienceRating: 'unknown'
        },
        cinemaSnapshot: {
            id: 'legacy-cinema:unknown',
            name: '历史影院（信息未记录）',
            city: '',
            address: ''
        },
        auditoriumSnapshot: {
            id: `legacy-auditorium:${parseShowtimeId(order.showtimeId).hallType}`,
            name: legacyAuditoriumName(order.showtimeId)
        },
        showtimeSnapshot: {
            id: showtimeId,
            startsAt: null,
            endsAt: null,
            format: 'unknown',
            language: 'unknown',
            subtitle: '',
            accessibilityFeatures: []
        },
        ticketItems: [{
            ticketTypeId: 'legacy-bundle',
            label: '历史票价',
            quantity: 1,
            unitPrice: total,
            eligibilityNote: 'v2 订单未记录票种'
        }],
        seatSnapshots,
        pricingQuote: {
            pricingPolicyId: 'legacy-pricing',
            currency,
            ticketLines: [{
                ticketTypeId: 'legacy-bundle',
                label: '历史票价',
                quantity: 1,
                unitPrice: total,
                amount: total,
                eligibilityNote: 'v2 订单未记录票种'
            }],
            seatLines: seatSnapshots.map(seat => ({
                seatId: seat.id,
                label: seat.label,
                zoneId: seat.zoneId,
                amount: zero
            })),
            ticketSubtotal: total,
            seatSurcharge: zero,
            serviceFee: zero,
            discount: zero,
            total,
            quotedAt: order.createdAt
        },
        refundPolicySnapshot: {
            id: 'legacy-refund:unknown',
            refundable: null,
            cutoffMinutesBeforeShowtime: null,
            feeAmount: null,
            currency,
            summary: '历史订单未记录原场次退改规则'
        },
        ticketCode: `LEGACY-${order.id}`,
        qrPayload: `smartcinema:legacy:${order.id}`,
        confirmedAt: order.confirmedAt,
        cancelledAt: order.cancelledAt,
        refund: order.status === 'cancelled' ? {
            amount: createMoney(order.refund.amount * 100, order.refund.currency),
            status: order.refund.status
        } : null
    };
    return rehydrateCommercialOrder(migrated);
}

export class MigrateV2ToV3 {
    constructor({ storage, v3Repository, clock }) {
        this.storage = storage;
        this.v3Repository = v3Repository;
        this.clock = clock;
    }

    run() {
        if (this.storage.getItem(STATE_STORAGE_KEY_V3) !== null) {
            const existing = this.v3Repository.read();
            if (!existing.ok) return existing;
            return ok({ state: existing.value, migrated: false, report: existing.value.migration });
        }

        const rawV2 = this.storage.getItem(STATE_STORAGE_KEY_V2);
        if (rawV2 === null) return err('MIGRATION_REQUIRED', '缺少可迁移的 v2 state');

        let parsed;
        try {
            parsed = JSON.parse(rawV2);
        } catch (error) {
            return err('STORAGE_CORRUPTED', 'v2 state JSON 无法解析', { reason: error.message });
        }
        const validatedV2 = validateStateEnvelope(parsed);
        if (!validatedV2.ok) return validatedV2;

        try {
            this.storage.setItem(V2_BACKUP_BEFORE_V3_KEY, rawV2);
        } catch (error) {
            return err('STORAGE_WRITE_FAILED', '无法在 v3 迁移前备份 v2 state', { reason: error.message });
        }

        try {
            const now = this.clock.now();
            const v2 = validatedV2.value;
            const inventoriesByShowtime = {};
            Object.values(v2.inventoriesByShowtime).forEach(inventory => {
                const mapped = mapInventory(inventory);
                inventoriesByShowtime[mapped.showtimeId] = mapped;
            });
            const ordersById = {};
            Object.values(v2.ordersById).forEach(order => {
                const mapped = mapOrder(order);
                ordersById[mapped.id] = mapped;
            });
            const warnings = Object.keys(ordersById).length > 0 ? [
                'v2 订单未记录电影、影院和具体时间，已作为 legacy 快照保留。'
            ] : [];
            const candidate = {
                schemaVersion: 3,
                revision: v2.revision,
                updatedAt: now,
                usersById: cloneJson(v2.usersById),
                session: cloneJson(v2.session),
                ordersById,
                inventoriesByShowtime,
                holdsById: {},
                settingsByUser: cloneJson(v2.settingsByUser),
                migration: {
                    fromVersion: 2,
                    completedAt: now,
                    warnings,
                    sourceBackupKey: V2_BACKUP_BEFORE_V3_KEY
                }
            };
            const validatedV3 = validateStateEnvelopeV3(candidate);
            if (!validatedV3.ok) return validatedV3;
            const initialized = this.v3Repository.initialize(validatedV3.value);
            if (!initialized.ok) return initialized;
            return ok({
                state: initialized.value,
                migrated: true,
                report: initialized.value.migration
            });
        } catch (error) {
            return err('MIGRATION_FAILED', 'v2 → v3 迁移失败', { reason: error.message });
        }
    }
}

export default MigrateV2ToV3;
