function toViewResult(result, successMessage) {
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
 * Adapts AppController authentication results to the stable UI result shape.
 */
export class AuthViewAdapter {
    constructor(controller) {
        this.controller = controller;
    }

    register(input) {
        return toViewResult(this.controller.register(input), '注册成功！您已获得会员资格');
    }

    login(username, password) {
        return toViewResult(this.controller.login(username, password), '登录成功');
    }

    logout() {
        return toViewResult(this.controller.logout(), '已退出登录');
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

export default AuthViewAdapter;
