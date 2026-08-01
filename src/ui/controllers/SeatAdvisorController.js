import { seatPreferenceLabels } from '../../domain/booking/SeatPreferenceIntent.js';
import {
    interpretSeatPreferenceLocally
} from '../../infrastructure/ai/RuleBasedSeatPreferenceInterpreter.js';
import { appendText } from '../views/ViewHelpers.js';

function element(id) {
    return document.getElementById(id);
}

export class SeatAdvisorController {
    constructor({
        booking,
        getDraft,
        getContext,
        getPreferences,
        onPreview,
        onClearPreview,
        onApply,
        onAnnounce = () => {},
        onNotify = () => {}
    }) {
        this.booking = booking;
        this.getDraft = getDraft;
        this.getContext = getContext;
        this.getPreferences = getPreferences;
        this.onPreview = onPreview;
        this.onClearPreview = onClearPreview;
        this.onApply = onApply;
        this.onAnnounce = onAnnounce;
        this.onNotify = onNotify;
        this.opened = false;
        this.busy = false;
        this.preview = null;
        this.abortController = null;
        this.applied = false;
        this.composerExpanded = true;
        this.mobileMedia = matchMedia('(max-width: 780px)');
        this._bind();
        this._render();
    }

    _bind() {
        element('seat-advisor-open').addEventListener('click', () => {
            if (this.opened) this.close();
            else this.open();
        });
        element('seat-advisor-close').addEventListener('click', () => this.close());
        element('seat-advisor-form').addEventListener('submit', event => {
            event.preventDefault();
            this.generatePreview();
        });
        element('seat-advisor-input').addEventListener('input', () => {
            if (this.busy || this.preview) {
                this.invalidate('偏好已更新，可以重新生成预览。');
            }
        });
        element('seat-advisor-input').addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                this.generatePreview();
            }
        });
        element('seat-advisor-panel').addEventListener('click', event => {
            const example = event.target.closest('[data-seat-advisor-example]');
            if (!example) return;
            const input = element('seat-advisor-input');
            input.value = example.dataset.seatAdvisorExample;
            input.focus();
            this.invalidate('已填入偏好示例。');
        });
        element('seat-advisor-next').addEventListener('click', () => this.showNext());
        element('seat-advisor-edit').addEventListener('click', () => this.editPreference());
        element('seat-advisor-apply').addEventListener('click', () => this.apply());
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.opened) this.close();
        });
        this.mobileMedia.addEventListener('change', () => this._render());
    }

    open() {
        const draft = this.getDraft();
        if (!draft || draft.ticketCount < 1) {
            this.onNotify('请先确定票种与人数');
            return;
        }
        this.opened = true;
        this.applied = false;
        this.composerExpanded = true;
        this._render();
        window.requestAnimationFrame(() => element('seat-advisor-input').focus({ preventScroll: true }));
    }

    close({ keepPreview = false } = {}) {
        if (!this.opened) return;
        this.opened = false;
        this._abort();
        if (!keepPreview && !this.applied) this._clearPreview();
        this._render();
        element('seat-advisor-open').focus({ preventScroll: true });
    }

    invalidate(message = '上下文已变化，请重新生成预览。') {
        this._abort();
        this.busy = false;
        this.composerExpanded = true;
        this._clearPreview();
        element('seat-advisor-status').textContent = message;
        this._render();
    }

    async generatePreview() {
        const input = element('seat-advisor-input');
        const preferenceText = input.value.trim();
        if (!preferenceText) {
            element('seat-advisor-status').textContent = '先用一句话告诉智能选座你的偏好。';
            input.focus();
            return;
        }
        const draft = this.getDraft();
        const context = this.getContext();
        if (!draft || !context) return;
        const requestContext = {
            ticketCount: draft.ticketCount,
            partyType: draft.partyType,
            preferences: this.getPreferences()
        };
        this._abort();
        this._clearPreview();
        this.busy = true;
        this.abortController = new AbortController();
        element('seat-advisor-status').textContent = '正在理解偏好并寻找符合规则的连座…';
        this._render();

        let intent;
        let source = 'local';
        try {
            const response = await fetch('/api/seat-advisor/intent', {
                method: 'POST',
                signal: this.abortController.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preferenceText,
                    context: requestContext
                })
            });
            if (!response.ok) throw new Error(`HTTP_${response.status}`);
            const payload = await response.json();
            if (!payload?.ok || !payload.intent) throw new Error('INVALID_RESPONSE');
            intent = payload.intent;
            source = payload.source === 'deepseek' ? 'deepseek' : 'fallback';
        } catch (error) {
            if (error.name === 'AbortError') return;
            intent = interpretSeatPreferenceLocally(preferenceText, requestContext);
        }
        this.abortController = null;
        this.busy = false;
        const recommendation = this.booking.recommendSeats(draft, {
            advisorIntent: intent,
            includeAlternate: false,
            limit: 5
        });
        if (!recommendation.ok || recommendation.value.status !== 'recommended') {
            element('seat-advisor-status').textContent = recommendation.error?.message ||
                '当前没有符合规则的完整连座。';
            this._render();
            return;
        }
        this.preview = {
            intent,
            source,
            candidates: recommendation.value.candidates.map(candidate => ({
                candidate,
                reason: candidate.reason
            })),
            currentIndex: 0,
            inventoryRevision: recommendation.value.inventoryRevision
        };
        this.composerExpanded = !this.mobileMedia.matches;
        element('seat-advisor-status').textContent = source === 'deepseek' ?
            '已理解偏好并生成预览，高亮座位尚未写入本单。' :
            '已使用本地偏好解释生成预览，高亮座位尚未写入本单。';
        this._showCurrentCandidate({ focusSeat: true });
        this._render();
        if (this.mobileMedia.matches) this._revealSeatMap();
    }

    showNext() {
        if (!this.preview || this.preview.candidates.length < 2) return;
        this.preview.currentIndex =
            (this.preview.currentIndex + 1) % this.preview.candidates.length;
        this._showCurrentCandidate({ focusSeat: true });
        this._render();
    }

    editPreference() {
        this.composerExpanded = true;
        this._render();
        window.requestAnimationFrame(() => element('seat-advisor-input').focus({ preventScroll: true }));
    }

    apply() {
        const entry = this.currentEntry();
        if (!entry || !this.preview) return;
        const applied = this.onApply({
            candidate: entry.candidate,
            reason: entry.reason,
            inventoryRevision: this.preview.inventoryRevision
        });
        if (!applied) {
            this.invalidate('座位库存已变化，请重新生成预览。');
            return;
        }
        this.applied = true;
        const labels = entry.candidate.seats.map(seat => seat.label).join('、');
        element('seat-advisor-status').textContent = `已采用 ${labels}。`;
        this.onAnnounce(`已采用智能选座推荐 ${labels}`);
        this._render();
        this.close({ keepPreview: true });
    }

    currentEntry() {
        return this.preview?.candidates?.[this.preview.currentIndex] || null;
    }

    _showCurrentCandidate({ focusSeat = false } = {}) {
        const entry = this.currentEntry();
        if (!entry) return;
        this.onPreview(entry.candidate, { focusSeat });
        element('seat-advisor-summary').textContent = this.preview.intent.summary;
        element('seat-advisor-position').textContent =
            `方案 ${this.preview.currentIndex + 1}/${this.preview.candidates.length} · ` +
            entry.candidate.seats.map(seat => seat.label).join('、');
        const tags = element('seat-advisor-tags');
        tags.replaceChildren();
        seatPreferenceLabels(this.preview.intent).forEach(label => appendText(tags, 'span', label));
        element('seat-advisor-reason').textContent = entry.reason;
        this.onAnnounce(`预览 ${entry.candidate.seats.map(seat => seat.label).join('、')}`);
    }

    _revealSeatMap() {
        window.requestAnimationFrame(() => {
            document.querySelector('.seat-stage')?.scrollIntoView({
                block: 'nearest',
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
            });
        });
    }

    _clearPreview() {
        if (this.preview) this.onClearPreview();
        this.preview = null;
    }

    _abort() {
        if (this.abortController) this.abortController.abort();
        this.abortController = null;
    }

    _mountPanel() {
        const panel = element('seat-advisor-panel');
        const target = this.mobileMedia.matches ?
            element('seat-advisor-mobile-host') : element('seat-advisor-desktop-host');
        if (panel.parentElement !== target) target.append(panel);
    }

    _render() {
        this._mountPanel();
        const mobile = this.mobileMedia.matches;
        const trigger = element('seat-advisor-open');
        const panel = element('seat-advisor-panel');
        const mobileHost = element('seat-advisor-mobile-host');
        const desktopHost = element('seat-advisor-desktop-host');
        const summary = element('booking-summary-card');
        const compact = mobile && Boolean(this.preview) && !this.composerExpanded;
        trigger.setAttribute('aria-expanded', String(this.opened));
        panel.setAttribute('aria-hidden', String(!this.opened));
        panel.hidden = !this.opened;
        panel.dataset.compact = String(compact);
        mobileHost.hidden = !this.opened || !mobile;
        desktopHost.hidden = !this.opened || mobile;
        summary.hidden = this.opened && !mobile;
        element('seat-advisor-composer').hidden = compact;
        element('seat-advisor-submit').disabled = this.busy;
        element('seat-advisor-submit').textContent = this.busy ? '正在比较…' : '生成座位预览';
        element('seat-advisor-result').hidden = !this.preview;
        const next = element('seat-advisor-next');
        next.disabled = !this.preview || this.preview.candidates.length < 2;
        next.textContent = this.preview && this.preview.candidates.length < 2 ? '已是唯一方案' : '换一组';
        element('seat-advisor-edit').hidden = !this.preview;
        element('seat-advisor-apply').disabled = !this.preview || this.busy;
    }
}

export default SeatAdvisorController;
