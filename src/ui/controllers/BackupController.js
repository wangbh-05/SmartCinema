export class BackupController {
    constructor({ controller, document, browserWindow }) {
        this.controller = controller;
        this.document = document;
        this.window = browserWindow;
    }

    export() {
        const includeCredentials = this.window.confirm(
            '是否导出可移植的完整备份？\n\n' +
            '“确定”会包含本地演示账号的明文密码，请妥善保管。\n' +
            '“取消”仍会导出不含密码的安全备份；该备份只能恢复到保留同一账号的安装。'
        );
        const exported = this.controller.exportBackup({ includeCredentials });
        if (!exported.ok) {
            this.window.alert(`✗ 导出失败：${exported.error.message}`);
            return false;
        }

        const blob = new this.window.Blob([exported.value.json], { type: 'application/json' });
        const url = this.window.URL.createObjectURL(blob);
        const link = this.document.createElement('a');
        link.href = url;
        link.download = `smartcinema_backup_${new Date().toISOString().slice(0, 10)}.json`;
        link.hidden = true;
        this.document.body.appendChild(link);
        link.click();
        link.remove();
        this.window.setTimeout(() => this.window.URL.revokeObjectURL(url), 0);
        return true;
    }

    import() {
        const input = this.document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', event => this._readImport(event.target.files?.[0]), { once: true });
        input.click();
    }

    _readImport(file) {
        if (!file) {
            return;
        }
        const reader = new this.window.FileReader();
        reader.addEventListener('load', event => this._confirmImport(event.target.result), { once: true });
        reader.addEventListener('error', () => this.window.alert('✗ 无法读取所选文件'), { once: true });
        reader.readAsText(file);
    }

    _confirmImport(json) {
        const confirmed = this.window.confirm(
            '导入会用所选备份替换当前用户、订单、库存和设置。\n' +
            '系统会先保存一份当前 v2 状态用于恢复。是否继续？'
        );
        if (!confirmed) {
            return false;
        }

        const imported = this.controller.importBackup(json);
        if (!imported.ok) {
            this.window.alert(`✗ 导入失败：${imported.error.message}`);
            return false;
        }
        const cleanupNote = imported.value.cleanupWarning ? `\n注意：${imported.value.cleanupWarning}` : '';
        this.window.alert(`✓ 数据已安全导入，当前登录状态已清除，即将刷新${cleanupNote}`);
        this.window.location.reload();
        return true;
    }
}

export default BackupController;
