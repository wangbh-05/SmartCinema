function toLegacyResult(result, successMessage) {
    if (!result.ok) {
        return {
            success: false,
            message: result.error.message,
            code: result.error.code
        };
    }
    return {
        success: true,
        message: successMessage,
        user: result.value?.user || null
    };
}

/**
 * 迁移期认证 facade。
 *
 * 只保留旧页面正在使用的方法形状；事实源始终是 AppController/Storage v2。
 */
export class LegacyAuthFacade {
    constructor(controller) {
        this.controller = controller;
    }

    register(input) {
        return toLegacyResult(this.controller.register(input), '注册成功！您已获得会员资格');
    }

    login(username, password) {
        return toLegacyResult(this.controller.login(username, password), '登录成功');
    }

    logout() {
        return toLegacyResult(this.controller.logout(), '已退出登录');
    }

    isLoggedIn() {
        return this.controller.isLoggedIn();
    }

    isAdmin() {
        return this.controller.isAdmin();
    }

    getCurrentUser() {
        return this.controller.getCurrentUser();
    }

    getAllUsers() {
        const result = this.controller.listUsers();
        return result.ok ? result.value : [];
    }
}

export default LegacyAuthFacade;
