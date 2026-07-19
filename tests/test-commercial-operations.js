import { CommercialOperationsService } from '../src/application/commercial/CommercialOperationsService.js';
import { createBrowserCommercialApplication } from '../src/bootstrapCommercial.js';
import {
    IMPORT_ROLLBACK_KEY_V3,
    StateBackupServiceV3
} from '../src/infrastructure/storage/StateBackupServiceV3.js';

const NOW = '2026-07-18T02:00:00.000Z';

class MemoryWebStorage {
    constructor() {
        this.data = new Map();
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
    }
}

class FakeClock {
    constructor(value = NOW) {
        this.value = value;
    }

    now() {
        return this.value;
    }

    set(value) {
        this.value = value;
    }
}

class SequenceIdGenerator {
    constructor() {
        this.index = 0;
    }

    next(prefix) {
        this.index++;
        return `${prefix}-${this.index}`;
    }
}

export default class TestCommercialOperations {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✓ ${name}`);
        } catch (error) {
            this.failed++;
            console.error(`✗ ${name}`, error.message);
        }
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }

    runAll() {
        console.log('\n========== Commercial Operations 测试 ==========\n');

        this.test('未登录用户不得读取运维仪表盘', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            const result = deps.operations.getDashboard();
            this.assertEqual(result.ok, false);
            this.assertEqual(result.error.code, 'AUTH_REQUIRED');
        });

        this.test('普通会员不得读取运维仪表盘', () => {
            const deps = this._deps();
            this.assertTrue(deps.app.initialize().ok);
            this.assertTrue(deps.app.account.register({
                username: 'operator-member',
                password: 'secret1',
                name: '普通会员',
                email: ''
            }).ok);
            const result = deps.operations.getDashboard();
            this.assertEqual(result.ok, false);
            this.assertEqual(result.error.code, 'FORBIDDEN');
        });

        this.test('管理员仪表盘应组合场次、库存、订单和脱敏用户', () => {
            const deps = this._adminDeps();
            const result = deps.operations.getDashboard();
            this.assertTrue(result.ok, result.error?.message);
            this.assertEqual(result.value.summary.showtimeCount, 108);
            this.assertEqual(result.value.showtimes.length, 108);
            this.assertEqual(result.value.summary.userCount, 1);
            this.assertEqual(result.value.operator.role, 'admin');
            this.assertTrue(result.value.users.every(user => user.credential === undefined));
            this.assertTrue(result.value.showtimes.every(showtime =>
                showtime.availableCount + showtime.soldCount + showtime.heldCount === showtime.capacity
            ));
        });

        this.test('管理员手动释放锁座应原子更新 hold 与库存', () => {
            const deps = this._adminDeps();
            const hold = this._placeHold(deps);
            const before = deps.operations.getDashboard();
            this.assertEqual(before.value.summary.activeHoldCount, 1);
            const released = deps.operations.releaseHold(hold.id);
            this.assertTrue(released.ok, released.error?.message);
            this.assertEqual(released.value.hold.status, 'released');
            const inventory = released.value.state.inventoriesByShowtime[hold.showtimeId];
            this.assertTrue(hold.seatIds.every(seatId => !inventory.holdIdsBySeatId[seatId]));
            this.assertEqual(deps.operations.getDashboard().value.summary.activeHoldCount, 0);
        });

        this.test('运维清理应只过期已到期锁座', () => {
            const deps = this._adminDeps();
            const hold = this._placeHold(deps);
            deps.clock.set('2026-07-18T02:11:00.000Z');
            const swept = deps.operations.sweepExpiredHolds();
            this.assertTrue(swept.ok, swept.error?.message);
            this.assertEqual(swept.value.expiredCount, 1);
            this.assertEqual(swept.value.state.holdsById[hold.id].status, 'expired');
        });

        this.test('脱敏诊断快照不得包含凭证且不可恢复', () => {
            const deps = this._adminDeps();
            const exported = deps.operations.exportBackup();
            this.assertTrue(exported.ok);
            this.assertEqual(exported.value.restorable, false);
            this.assertTrue(!exported.value.json.includes('admin123'));
            this.assertEqual(exported.value.payload.state.session, null);
            this.assertEqual(exported.value.payload.state.usersById.admin_001.credential, null);
            const imported = deps.operations.importBackup(exported.value.json);
            this.assertEqual(imported.ok, false);
            this.assertEqual(imported.error.code, 'BACKUP_NOT_RESTORABLE');
        });

        this.test('完整恢复备份应留下回滚快照、替换状态并清除会话', () => {
            const deps = this._adminDeps();
            const exported = deps.operations.exportBackup({ includeCredentials: true });
            this.assertTrue(exported.ok);
            this.assertTrue(exported.value.restorable);
            const hold = this._placeHold(deps);
            this.assertTrue(Boolean(deps.app.stateRepository.read().value.holdsById[hold.id]));
            const imported = deps.operations.importBackup(exported.value.json);
            this.assertTrue(imported.ok, imported.error?.message);
            this.assertEqual(imported.value.state.session, null);
            this.assertEqual(Object.keys(imported.value.state.holdsById).length, 0);
            this.assertTrue(deps.localStorage.getItem(IMPORT_ROLLBACK_KEY_V3) !== null);
            this.assertTrue(imported.value.state.revision > exported.value.payload.state.revision);
        });

        this.test('损坏或含未知字段的备份不得改变当前 state', () => {
            const deps = this._adminDeps();
            const before = deps.app.stateRepository.read().value;
            const imported = deps.operations.importBackup(JSON.stringify({
                exportFormat: 'smartcinema-backup',
                exportVersion: 3,
                exportedAt: NOW,
                credentialPolicy: 'included-demo-plaintext',
                restorable: true,
                state: before,
                unexpected: true
            }));
            this.assertEqual(imported.ok, false);
            this.assertEqual(imported.error.code, 'BACKUP_INVALID');
            const after = deps.app.stateRepository.read().value;
            this.assertEqual(after.revision, before.revision);
        });

        return this.printSummary();
    }

    _deps() {
        const localStorage = new MemoryWebStorage();
        const sessionStorage = new MemoryWebStorage();
        const clock = new FakeClock();
        const idGenerator = new SequenceIdGenerator();
        const app = createBrowserCommercialApplication({
            localStorage,
            sessionStorage,
            clock,
            idGenerator,
            businessDate: '2026-07-18'
        });
        const backup = new StateBackupServiceV3({
            stateRepository: app.stateRepository,
            storage: localStorage,
            clock
        });
        const operations = new CommercialOperationsService({
            stateRepository: app.stateRepository,
            booking: app.booking,
            backup,
            clock
        });
        return { app, operations, localStorage, sessionStorage, clock, idGenerator };
    }

    _adminDeps() {
        const deps = this._deps();
        this.assertTrue(deps.app.initialize().ok);
        this.assertTrue(deps.app.account.login('admin', 'admin123').ok);
        return deps;
    }

    _placeHold(deps) {
        const showtimeId = deps.app.booking.listShowtimes().value
            .find(item => item.availability.bookable).showtime.id;
        const draft = deps.app.booking.createDraft({
            showtimeId,
            ticketItems: [{ ticketTypeId: 'adult', quantity: 1 }],
            preferences: ['center']
        });
        const recommended = deps.app.booking.recommendSeats(draft.value);
        this.assertTrue(recommended.ok, recommended.error?.message);
        const placed = deps.app.booking.placeHold({
            draft: recommended.value.draft,
            ownerId: deps.app.account.getCurrentUser().id,
            idempotencyKey: deps.app.booking.createHoldRequestKey(),
            holdDurationSeconds: 600
        });
        this.assertTrue(placed.ok, placed.error?.message);
        return placed.value.hold;
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}
