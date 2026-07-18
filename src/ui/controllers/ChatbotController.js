const SUGGESTIONS = ['推荐座位', '票价多少', '哪个位置好', '怎么看评分', '放映厅信息', '帮助'];

export class ChatbotController {
    constructor({ chatbot, document, getSeatData, scheduler, random = Math.random }) {
        this.chatbot = chatbot;
        this.document = document;
        this.getSeatData = getSeatData;
        this.scheduler = scheduler;
        this.random = random;
        this.toggleButton = document.getElementById('ai-chat-toggle');
        this.panel = document.getElementById('ai-chat-panel');
        this.closeButton = document.getElementById('ai-chat-close');
        this.sendButton = document.getElementById('ai-chat-send');
        this.input = document.getElementById('ai-chat-input');
        this.messages = document.getElementById('ai-chat-messages');
        this.suggestions = document.getElementById('ai-chat-suggestions');
        this.bound = false;
    }

    bind() {
        if (this.bound) {
            return;
        }
        this.bound = true;
        this.toggleButton?.addEventListener('click', () => this.toggle());
        this.closeButton?.addEventListener('click', () => this.toggle(false));
        this.sendButton?.addEventListener('click', () => this.send());
        this.input?.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.send();
            }
        });
        this.renderSuggestions();
    }

    toggle(show) {
        if (!this.panel) {
            return false;
        }
        const currentlyVisible = this.panel.style.display === 'flex';
        const visible = show === undefined ? !currentlyVisible : Boolean(show);
        this.panel.style.display = visible ? 'flex' : 'none';
        this.toggleButton?.setAttribute('aria-expanded', String(visible));
        if (visible) {
            this.input?.focus();
        }
        return visible;
    }

    renderSuggestions() {
        if (!this.suggestions) {
            return;
        }
        const chips = SUGGESTIONS.map(label => {
            const chip = this.document.createElement('button');
            chip.type = 'button';
            chip.className = 'ai-chat-chip';
            chip.textContent = label;
            chip.addEventListener('click', () => {
                this.input.value = label;
                this.send();
            });
            return chip;
        });
        this.suggestions.replaceChildren(...chips);
    }

    send() {
        if (!this.input || !this.messages) {
            return false;
        }
        const text = this.input.value.trim();
        if (!text) {
            return false;
        }
        this.chatbot.sd = this.getSeatData();
        this._appendMessage('user', text);
        this.input.value = '';
        const delay = 200 + this.random() * 400;
        this.scheduler.setTimeout(() => {
            this._appendMessage('bot', this.chatbot.chat(text));
        }, delay);
        return true;
    }

    _appendMessage(role, text) {
        const message = this.document.createElement('div');
        message.className = `ai-chat-msg ${role}`;
        message.textContent = text;
        this.messages.appendChild(message);
        this.messages.scrollTop = this.messages.scrollHeight;
    }
}

export default ChatbotController;
