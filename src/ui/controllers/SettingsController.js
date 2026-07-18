const CONTROL_IDS = Object.freeze({
    theme: 'theme-toggle',
    accessibilityMode: 'accessibility-toggle',
    voiceEnabled: 'voice-toggle',
    colorblindMode: 'colorblind-toggle',
    realtimeEnabled: 'realtime-toggle'
});

export class SettingsController {
    constructor({
        controller,
        document,
        a11yManager,
        cinema,
        heatmap = null,
        realtime,
        onExport,
        onExportFull,
        onImport,
        onError
    }) {
        if (!controller || !document || !a11yManager || !cinema || !realtime) {
            throw new TypeError('SettingsController 缺少必要依赖');
        }
        this.controller = controller;
        this.document = document;
        this.a11yManager = a11yManager;
        this.cinema = cinema;
        this.heatmap = heatmap;
        this.realtime = realtime;
        this.onExport = onExport;
        this.onExportFull = onExportFull;
        this.onImport = onImport;
        this.onError = onError;
        this.bound = false;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        this._control('theme')?.addEventListener('change', event => {
            this.setTheme(event.target.checked ? 'dark' : 'light');
        });
        this._control('accessibilityMode')?.addEventListener('change', event => {
            this.setAccessibilityMode(event.target.checked);
        });
        this._control('voiceEnabled')?.addEventListener('change', event => {
            this.setVoiceEnabled(event.target.checked);
        });
        this._control('colorblindMode')?.addEventListener('change', event => {
            this.setColorblindMode(event.target.checked);
        });
        this._control('realtimeEnabled')?.addEventListener('change', event => {
            this.setRealtimeEnabled(event.target.checked);
        });
        this.document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.addEventListener('click', () => this.setAccentColor(dot.dataset.accent));
        });
        this.document.getElementById('accent-picker')?.addEventListener('input', event => {
            this.setAccentColor(event.target.value);
        });
        this.document.getElementById('export-data')?.addEventListener('click', () => this.onExport?.());
        this.document.getElementById('export-full-data')?.addEventListener('click', () => this.onExportFull?.());
        this.document.getElementById('import-data')?.addEventListener('click', () => this.onImport?.());
    }

    load() {
        const settings = this.controller.getState()?.settings;
        if (!settings) return false;
        this._applyTheme(settings.theme);
        this._applyAccessibilityMode(settings.accessibilityMode);
        this._applyVoiceEnabled(settings.voiceEnabled);
        this._applyColorblindMode(settings.colorblindMode);
        this._applyRealtimeEnabled(settings.realtimeEnabled);
        this._applyAccentColor(settings.accentColor);
        this._syncControls(settings);
        return true;
    }

    setTheme(theme, persist = true) {
        if (!this._persist({ theme }, persist)) return false;
        const applied = this._current('theme', theme);
        this._applyTheme(applied);
        const control = this._control('theme');
        if (control) control.checked = applied === 'dark';
        return true;
    }

    setAccessibilityMode(enabled, persist = true) {
        if (!this._persist({ accessibilityMode: enabled }, persist)) return false;
        const applied = this._current('accessibilityMode', enabled);
        this._applyAccessibilityMode(applied);
        const control = this._control('accessibilityMode');
        if (control) control.checked = applied;
        if (applied && persist) this.a11yManager.speak('无障碍模式已启用');
        return true;
    }

    setVoiceEnabled(enabled, persist = true) {
        if (!this._persist({ voiceEnabled: enabled }, persist)) return false;
        const applied = this._current('voiceEnabled', enabled);
        this._applyVoiceEnabled(applied);
        const control = this._control('voiceEnabled');
        if (control) control.checked = applied;
        return true;
    }

    setColorblindMode(enabled, persist = true) {
        if (!this._persist({ colorblindMode: enabled }, persist)) return false;
        const applied = this._current('colorblindMode', enabled);
        this._applyColorblindMode(applied);
        const control = this._control('colorblindMode');
        if (control) control.checked = applied;
        return true;
    }

    setRealtimeEnabled(enabled, persist = true) {
        if (!this._persist({ realtimeEnabled: enabled }, persist)) return false;
        const applied = this._current('realtimeEnabled', enabled);
        this._applyRealtimeEnabled(applied);
        const control = this._control('realtimeEnabled');
        if (control) control.checked = applied;
        return true;
    }

    setAccentColor(color, persist = true) {
        if (!this._persist({ accentColor: color }, persist)) return false;
        const applied = this._current('accentColor', color);
        this._applyAccentColor(applied);
        return true;
    }

    _persist(patch, persist) {
        if (!persist) return true;
        const result = this.controller.updateSettings(patch);
        if (result.ok) return true;
        this.onError?.(result.error.message);
        this.load();
        return false;
    }

    _current(key, fallback) {
        return this.controller.getState()?.settings?.[key] ?? fallback;
    }

    _syncControls(settings) {
        const values = {
            theme: settings.theme === 'dark',
            accessibilityMode: settings.accessibilityMode,
            voiceEnabled: settings.voiceEnabled,
            colorblindMode: settings.colorblindMode,
            realtimeEnabled: settings.realtimeEnabled
        };
        Object.entries(values).forEach(([key, checked]) => {
            const control = this._control(key);
            if (control) control.checked = checked;
        });
    }

    _applyTheme(theme) {
        this.document.body.classList.toggle('dark-mode', theme === 'dark');
    }

    _applyAccessibilityMode(enabled) {
        this.document.body.classList.toggle('accessibility-mode', enabled);
    }

    _applyVoiceEnabled(enabled) {
        this.a11yManager.setVoiceEnabled(enabled);
    }

    _applyColorblindMode(enabled) {
        this.document.body.classList.toggle('colorblind-mode', enabled);
        this.cinema.setColorblindMode(enabled);
        this.heatmap?.setColorblindMode(enabled);
    }

    _applyRealtimeEnabled(enabled) {
        if (enabled) this.realtime.start();
        else this.realtime.stop();
    }

    _applyAccentColor(color) {
        this.document.documentElement.style.setProperty('--accent', color);
        const picker = this.document.getElementById('accent-picker');
        if (picker) picker.value = color;
        this.document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.accent.toUpperCase() === color.toUpperCase());
        });
    }

    _control(key) {
        return this.document.getElementById(CONTROL_IDS[key]);
    }
}

export default SettingsController;
