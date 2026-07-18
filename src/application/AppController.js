import { err, ok } from '../shared/Result.js';
import { createSeatInventory } from '../domain/cinema/SeatInventory.js';
import { replaceSelection } from '../domain/cinema/LocalSelection.js';
import { sanitizeUser } from '../domain/user/User.js';
import { createAppState, invalidateSelectionDerivedState } from './AppState.js';
import { loginUser } from './auth/Login.js';
import { listUsers } from './auth/ListUsers.js';
import { logoutUser } from './auth/Logout.js';
import { registerUser } from './auth/Register.js';
import { cancelUserOrder } from './booking/CancelOrder.js';
import { confirmCheckout } from './booking/ConfirmCheckout.js';
import { listVisibleOrders } from './booking/ListOrders.js';
import { startCheckout } from './booking/StartCheckout.js';
import { applyRemoteHold } from './selection/ApplyRemoteHold.js';
import { changeShowtime } from './selection/ChangeShowtime.js';
import { toggleSeat } from './selection/ToggleSeat.js';
import { updateSettings } from './settings/UpdateSettings.js';

export class AppController {
    constructor({
        stateRepository,
        checkoutIntentRepository,
        migration,
        clock,
        idGenerator
    }) {
        this.stateRepository = stateRepository;
        this.checkoutIntentRepository = checkoutIntentRepository;
        this.migration = migration;
        this.clock = clock;
        this.idGenerator = idGenerator;
        this.appState = null;
    }

    initialize(showtimeId = 'medium:day:3') {
        const migrated = this.migration.run();
        if (!migrated.ok) return migrated;
        this.appState = createAppState(migrated.value.state, showtimeId, this.clock.now());
        return ok({
            state: this.appState,
            migration: migrated.value.report,
            migrated: migrated.value.migrated
        });
    }

    getState() {
        return this.appState;
    }

    getCurrentUser() {
        const persisted = this.stateRepository.read();
        if (!persisted.ok || !persisted.value.session) return null;
        const user = persisted.value.usersById[persisted.value.session.userId];
        return user ? sanitizeUser(user) : null;
    }

    isLoggedIn() {
        return this.getCurrentUser() !== null;
    }

    isAdmin() {
        return this.getCurrentUser()?.role === 'admin';
    }

    listUsers() {
        return listUsers(this._deps());
    }

    register(input) {
        return this._applyPersistentResult(registerUser(this._deps(), input));
    }

    login(username, password) {
        return this._applyPersistentResult(loginUser(this._deps(), { username, password }));
    }

    logout() {
        return this._applyPersistentResult(logoutUser(this._deps()));
    }

    startCheckout(input) {
        return startCheckout(this._deps(), input);
    }

    getCheckoutIntent() {
        return this.checkoutIntentRepository.get();
    }

    clearCheckoutIntent() {
        return this.checkoutIntentRepository.clear();
    }

    confirmCheckout() {
        return this._applyPersistentResult(confirmCheckout(this._deps()));
    }

    cancelOrder(orderId, reason = '') {
        return this._applyPersistentResult(cancelUserOrder(this._deps(), { orderId, reason }));
    }

    listOrders(options) {
        return listVisibleOrders(this._deps(), options);
    }

    updateSettings(patch) {
        return this._applyPersistentResult(updateSettings(this._deps(), patch));
    }

    changeShowtime(showtimeId) {
        const persisted = this.stateRepository.read();
        if (!persisted.ok) return persisted;
        this.appState = changeShowtime(persisted.value, showtimeId, this.clock.now());
        return ok(this.appState);
    }

    toggleSeat(seatKey) {
        if (!this.appState) return err('VALIDATION_ERROR', 'AppController 尚未初始化');
        const result = toggleSeat(this.appState, seatKey, this.clock.now());
        if (result.ok) this.appState = result.value;
        return result;
    }

    replaceSelection(seatKeys) {
        if (!this.appState) return err('VALIDATION_ERROR', 'AppController 尚未初始化');
        try {
            const result = replaceSelection(
                this.appState.selection,
                seatKeys,
                this.appState.inventory,
                this.appState.remoteHoldsBySeatKey,
                this.clock.now()
            );
            if (result.ok) {
                this.appState = invalidateSelectionDerivedState(this.appState, result.value);
            }
            return result.ok ? ok(this.appState) : result;
        } catch (error) {
            return err('VALIDATION_ERROR', error.message);
        }
    }

    applyRemoteHold(event) {
        if (!this.appState) return err('VALIDATION_ERROR', 'AppController 尚未初始化');
        this.appState = applyRemoteHold(this.appState, event, this.clock.now());
        return ok(this.appState);
    }

    _deps() {
        return {
            stateRepository: this.stateRepository,
            checkoutIntentRepository: this.checkoutIntentRepository,
            clock: this.clock,
            idGenerator: this.idGenerator
        };
    }

    _applyPersistentResult(result) {
        if (!result.ok || !result.value?.state) return result;
        this._syncPersistentState(result.value.state);
        return result;
    }

    _syncPersistentState(persistedState) {
        if (!this.appState) return;
        const showtimeId = this.appState.showtimeId;
        const inventory = persistedState.inventoriesByShowtime[showtimeId] || createSeatInventory({
            showtimeId,
            revision: 0,
            soldSeatKeys: [],
            updatedAt: persistedState.updatedAt
        });
        const selectionResult = replaceSelection(
            this.appState.selection,
            this.appState.selection.seatKeys,
            inventory,
            this.appState.remoteHoldsBySeatKey,
            this.clock.now()
        );
        const selection = selectionResult.ok ? selectionResult.value :
            replaceSelection(this.appState.selection, [], inventory, new Map(), this.clock.now()).value;
        const settingsKey = persistedState.session?.userId || 'guest';
        this.appState = Object.freeze({
            ...this.appState,
            revision: persistedState.revision,
            session: persistedState.session,
            inventory,
            selection,
            recommendation: selectionResult.ok ? this.appState.recommendation : null,
            systemScore: selectionResult.ok ? this.appState.systemScore : null,
            combinedScore: selectionResult.ok ? this.appState.combinedScore : null,
            settings: persistedState.settingsByUser[settingsKey] || persistedState.settingsByUser.guest
        });
    }
}

export default AppController;
