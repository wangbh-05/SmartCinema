/**
 * AuthManager - 用户认证管理
 * 负责用户注册、登录、会员资格、管理员后台
 *
 * 数据存储: LocalStorage (key: smartcinema_users)
 *
 * 用户角色:
 *   - member: 普通会员（注册即获得）
 *   - admin:  管理员（预设账号或手动设置）
 */

const STORAGE_KEY = 'smartcinema_users';
const SESSION_KEY = 'smartcinema_session';

export class AuthManager {
    constructor(storage) {
        this.storage = storage;
        this.currentUser = null;  // 当前登录用户
        this._ensureAdminExists();
        this._restoreSession();
    }

    /* ================================================================
     * 初始化
     * ================================================================ */

    /** 确保至少存在一个管理员账号 */
    _ensureAdminExists() {
        const users = this._getUsers();
        const hasAdmin = users.some(u => u.role === 'admin');
        if (!hasAdmin) {
            users.push({
                id: 'admin_001',
                username: 'admin',
                password: 'admin123',
                name: '系统管理员',
                email: 'admin@smartcinema.com',
                role: 'admin',
                createdAt: new Date().toISOString()
            });
            this._saveUsers(users);
        }
    }

    /** 恢复上次登录会话 */
    _restoreSession() {
        try {
            const session = JSON.parse(localStorage.getItem(SESSION_KEY));
            if (session && session.username) {
                const user = this._findUser(session.username);
                if (user) {
                    this.currentUser = user;
                }
            }
        } catch (e) {
            // ignore
        }
    }

    /* ================================================================
     * 用户数据存取
     * ================================================================ */

    _getUsers() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    _saveUsers(users) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    }

    _findUser(username) {
        return this._getUsers().find(u => u.username === username);
    }

    _saveSession(user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            username: user.username,
            role: user.role,
            loginTime: new Date().toISOString()
        }));
    }

    _clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }

    /* ================================================================
     * 注册
     * ================================================================ */

    /**
     * 注册新用户（注册即获得会员资格）
     * @returns {{ success: boolean, message: string }}
     */
    register({ username, password, name, email }) {
        // 校验
        if (!username || username.trim().length < 3) {
            return { success: false, message: '用户名至少3个字符' };
        }
        if (!password || password.length < 6) {
            return { success: false, message: '密码至少6个字符' };
        }
        if (!name || name.trim().length === 0) {
            return { success: false, message: '请输入姓名' };
        }

        const users = this._getUsers();

        // 检查是否已存在
        if (users.find(u => u.username === username)) {
            return { success: false, message: '该用户名已被注册' };
        }

        const newUser = {
            id: 'user_' + Date.now(),
            username: username.trim(),
            password: password,           // 实际项目应加密，此处为作业简化
            name: name.trim(),
            email: email || '',
            role: 'member',               // 注册即会员
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        this._saveUsers(users);

        return { success: true, message: '注册成功！您已获得会员资格', user: this._sanitize(newUser) };
    }

    /* ================================================================
     * 登录
     * ================================================================ */

    /**
     * 用户登录
     * @returns {{ success: boolean, message: string, user?: object }}
     */
    login(username, password) {
        const user = this._findUser(username);
        if (!user) {
            return { success: false, message: '用户名不存在' };
        }
        if (user.password !== password) {
            return { success: false, message: '密码错误' };
        }

        this.currentUser = user;
        this._saveSession(user);
        return { success: true, message: '登录成功', user: this._sanitize(user) };
    }

    /** 管理员登录（与普通登录相同，但检查角色） */
    loginAdmin(username, password) {
        const result = this.login(username, password);
        if (result.success && result.user.role !== 'admin') {
            this.logout();
            return { success: false, message: '该账号无管理员权限' };
        }
        return result;
    }

    /** 登出 */
    logout() {
        this.currentUser = null;
        this._clearSession();
    }

    /* ================================================================
     * 状态查询
     * ================================================================ */

    /** 是否已登录 */
    isLoggedIn() {
        return this.currentUser !== null;
    }

    /** 是否为管理员 */
    isAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    }

    /** 获取当前用户 */
    getCurrentUser() {
        return this.currentUser ? this._sanitize(this.currentUser) : null;
    }

    /* ================================================================
     * 管理员功能
     * ================================================================ */

    /** 获取所有用户列表（仅管理员） */
    getAllUsers() {
        if (!this.isAdmin()) return [];
        return this._getUsers().map(u => this._sanitize(u));
    }

    /** 删除用户（仅管理员） */
    deleteUser(userId) {
        if (!this.isAdmin()) return { success: false, message: '无权限' };
        const users = this._getUsers();
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) return { success: false, message: '用户不存在' };
        if (users[idx].role === 'admin') return { success: false, message: '不能删除管理员' };
        users.splice(idx, 1);
        this._saveUsers(users);
        return { success: true, message: '用户已删除' };
    }

    /* ================================================================
     * 工具
     * ================================================================ */

    /** 去除密码字段的用户对象 */
    _sanitize(user) {
        const { password, ...safe } = user;
        return safe;
    }
}
