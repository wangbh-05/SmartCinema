/**
 * Accessibility Utils - 无障碍辅助工具
 * 提供键盘导航、语音提示等功能
 */

export class AccessibilityManager {
    constructor() {
        this.voiceEnabled = false;
        this.focusElement = null;
        this.keyboardShortcuts = new Map();
        
        this.initVoice();
        this.bindKeyboardEvents();
    }

    /**
     * 初始化语音 API
     */
    initVoice() {
        this.synth = window.speechSynthesis;
        this.supportVoice = !!this.synth;
    }

    /**
     * 启用/禁用语音提示
     */
    setVoiceEnabled(enabled) {
        this.voiceEnabled = enabled && this.supportVoice;
    }

    /**
     * 语音提示
     */
    speak(text, options = {}) {
        if (!this.voiceEnabled || !this.synth) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.lang || 'zh-CN';
        utterance.rate = options.rate || 1;
        utterance.pitch = options.pitch || 1;
        
        this.synth.speak(utterance);
    }

    /**
     * 绑定键盘事件
     */
    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K: 打开快捷键帮助
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.showKeyboardHelp();
            }

            // Alt + 1-9: 快速导航
            if (e.altKey && /^[1-9]$/.test(e.key)) {
                e.preventDefault();
                this.quickNavigate(parseInt(e.key));
            }

            // Tab: 焦点管理
            if (e.key === 'Tab') {
                this.manageFocus(e);
            }

            // Enter/Space: 激活当前焦点元素
            if ((e.key === 'Enter' || e.key === ' ') && document.activeElement) {
                if (document.activeElement.tagName === 'BUTTON') {
                    e.preventDefault();
                    document.activeElement.click();
                }
            }

            // Arrow keys: 导航
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                this.handleArrowKeyNavigation(e);
            }
        });
    }

    /**
     * 焦点管理
     */
    manageFocus(event) {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')?.closest('.active')) return;
        // 实现焦点陷阱，确保焦点在应用内循环
        const focusableElements = document.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    }

    /**
     * 处理方向键导航
     */
    handleArrowKeyNavigation(event) {
        const canvas = document.getElementById('cinema-canvas');
        if (document.activeElement === canvas) {
            // 允许 Canvas 处理方向键
            return;
        }

        // 其他元素可实现自定义导航
        const target = event.target;
        if (target.dataset.navigable === 'true') {
            event.preventDefault();
            // 实现导航逻辑
        }
    }

    /**
     * 快速导航菜单
     */
    quickNavigate(index) {
        const sections = document.querySelectorAll('main > section');
        if (index > 0 && index <= sections.length) {
            sections[index - 1].scrollIntoView({ behavior: 'smooth' });
            sections[index - 1].querySelector('h2')?.focus();
        }
    }

    /**
     * 显示键盘快捷键帮助
     */
    showKeyboardHelp() {
        const help = document.getElementById('keyboard-help') || this.createHelpModal();
        help.classList.add('active');
        this.speak('快捷键帮助已打开');
    }

    /**
     * 创建帮助模态框
     */
    createHelpModal() {
        const modal = document.createElement('div');
        modal.id = 'keyboard-help';
        modal.className = 'modal keyboard-help';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>⌨️ 键盘快捷键</h2>
                    <button class="modal-close" onclick="this.parentElement.parentElement.classList.remove('active')">✕</button>
                </div>
                <div class="modal-body">
                    <h3>导航</h3>
                    <ul>
                        <li><kbd>Tab</kbd> - 在元素间移动焦点</li>
                        <li><kbd>Shift + Tab</kbd> - 反向移动焦点</li>
                        <li><kbd>Alt + 1-9</kbd> - 快速跳转到对应分区</li>
                        <li><kbd>Enter</kbd> - 激活按钮或提交表单</li>
                        <li><kbd>Space</kbd> - 激活按钮或切换复选框</li>
                    </ul>

                    <h3>选座</h3>
                    <ul>
                        <li><kbd>↑↓←→</kbd> - 在座位间导航（在 Canvas 聚焦时）</li>
                        <li><kbd>Enter</kbd> - 选中/取消选中座位</li>
                        <li><kbd>Space</kbd> - 选中/取消选中座位</li>
                    </ul>

                    <h3>其他</h3>
                    <ul>
                        <li><kbd>Ctrl + K</kbd> - 打开此帮助</li>
                        <li><kbd>Ctrl + E</kbd> - 导出数据</li>
                        <li><kbd>Ctrl + I</kbd> - 导入数据</li>
                    </ul>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 点击外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        return modal;
    }

    /**
     * 公告重要信息（用于屏幕阅读器）
     */
    announce(message, level = 'polite') {
        const announcement = document.createElement('div');
        announcement.className = 'sr-only';
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', level);
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            announcement.remove();
        }, 1000);

        if (this.voiceEnabled) {
            this.speak(message);
        }
    }

    /**
     * 注册键盘快捷键
     */
    registerShortcut(key, callback, description) {
        this.keyboardShortcuts.set(key, { callback, description });
    }

    /**
     * 显示焦点指示器
     */
    showFocusIndicator(element) {
        element.classList.add('keyboard-focus');
        this.speak(`焦点在 ${element.getAttribute('aria-label') || element.textContent}`);
    }

    /**
     * 检查颜色对比度（可访问性检查）
     */
    checkContrast(foreground, background) {
        const getLuminance = (color) => {
            const rgb = parseInt(color, 16);
            const r = (rgb >> 16) & 0xff;
            const g = (rgb >> 8) & 0xff;
            const b = (rgb >> 0) & 0xff;
            
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance;
        };

        const lum1 = getLuminance(foreground);
        const lum2 = getLuminance(background);
        
        const contrast = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
        
        // WCAG AA 标准: 最少 4.5:1 (文本) 或 3:1 (UI 组件)
        return {
            ratio: contrast.toFixed(2),
            isAACompliant: contrast >= 4.5,
            isAAACompliant: contrast >= 7
        };
    }
}

export default AccessibilityManager;
