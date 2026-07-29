import { createSettings } from '../../domain/user/Settings.js';
import { createUser } from '../../domain/user/User.js';
import { ValidationError } from '../../shared/ValidationError.js';
import {
    STATE_SCHEMA_VERSION,
    validateState
} from './StateValidator.js';

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
        holdsById: {},
        settingsByUser: { guest: createSettings() }
    };
    const validated = validateState(state);
    if (!validated.ok) throw new ValidationError(validated.error.message, validated.error.details);
    return validated.value;
}
