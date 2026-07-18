import { updateSettings } from '../settings/UpdateSettings.js';
import { err, ok } from '../../shared/Result.js';

export class CommercialPreferencesService {
    constructor({ stateRepository }) {
        this.stateRepository = stateRepository;
    }

    get() {
        const current = this.stateRepository.read();
        if (!current.ok) return current;
        const key = current.value.session?.userId || 'guest';
        const settings = current.value.settingsByUser[key] || current.value.settingsByUser.guest;
        return settings ? ok(settings) : err('STORAGE_CORRUPTED', '当前账户缺少偏好设置');
    }

    update(patch) {
        return updateSettings({ stateRepository: this.stateRepository }, patch);
    }
}

export default CommercialPreferencesService;
