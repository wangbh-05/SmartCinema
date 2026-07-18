import { loginUser } from '../auth/Login.js';
import { listUsers } from '../auth/ListUsers.js';
import { logoutUser } from '../auth/Logout.js';
import { registerUser } from '../auth/Register.js';
import { sanitizeUser } from '../../domain/user/User.js';

export class CommercialAccountService {
    constructor({ stateRepository, clock, idGenerator }) {
        this.stateRepository = stateRepository;
        this.clock = clock;
        this.idGenerator = idGenerator;
    }

    register(input) {
        return registerUser(this._deps(), input);
    }

    login(username, password) {
        return loginUser(this._deps(), { username, password });
    }

    logout() {
        return logoutUser(this._deps());
    }

    listUsers() {
        return listUsers(this._deps());
    }

    getCurrentUser() {
        const current = this.stateRepository.read();
        if (!current.ok || !current.value.session) return null;
        const user = current.value.usersById[current.value.session.userId];
        return user ? sanitizeUser(user) : null;
    }

    isLoggedIn() {
        return this.getCurrentUser() !== null;
    }

    isAdmin() {
        return this.getCurrentUser()?.role === 'admin';
    }

    _deps() {
        return {
            stateRepository: this.stateRepository,
            clock: this.clock,
            idGenerator: this.idGenerator
        };
    }
}

export default CommercialAccountService;
