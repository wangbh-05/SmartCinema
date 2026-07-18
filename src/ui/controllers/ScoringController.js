export class ScoringController {
    constructor({ controller, document, getSeatLayout, onError }) {
        if (!controller || !document || typeof getSeatLayout !== 'function') {
            throw new TypeError('ScoringController 缺少必要依赖');
        }
        this.controller = controller;
        this.document = document;
        this.getSeatLayout = getSeatLayout;
        this.onError = onError;
        this.details = document.getElementById('score-details');
        this.manualPanel = document.getElementById('manual-score-panel');
        this.combined = document.getElementById('combined-score-result');
        this.bound = false;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        ['vision', 'distance', 'comfort', 'price'].forEach(key => {
            const input = this.document.getElementById(`manual-${key}`);
            const output = this.document.getElementById(`manual-${key}-val`);
            input?.addEventListener('input', () => {
                if (output) output.textContent = input.value;
            });
        });
        this.document.getElementById('btn-submit-score')?.addEventListener('click', () => {
            this.submitManualScore();
        });
    }

    update() {
        const layout = this.getSeatLayout();
        const selectedKeys = layout.seats.flat()
            .filter(seat => seat.isSelected)
            .map(seat => seat.seatKey);
        const synchronized = this.controller.replaceSelection(selectedKeys);
        if (!synchronized.ok) {
            this.onError?.(synchronized.error.message);
            return false;
        }
        const result = this.controller.calculateSystemScore(layout);
        if (!result.ok) {
            this.onError?.(result.error.message);
            return false;
        }
        this.renderSystemScore(result.value.systemScore);
        return true;
    }

    submitManualScore() {
        const result = this.controller.submitManualScore({
            vision: this._numberValue('manual-vision'),
            distance: this._numberValue('manual-distance'),
            comfort: this._numberValue('manual-comfort'),
            price: this._numberValue('manual-price')
        });
        if (!result.ok) {
            this.onError?.(result.error.message);
            return false;
        }
        this.renderCombinedScore(result.value.combinedScore);
        return true;
    }

    renderSystemScore(score) {
        if (!this.details) return;
        this._hideCombined();
        this.details.replaceChildren();
        if (score.totalScore === 0) {
            this.details.appendChild(this._element('p', 'score-placeholder', '请先选择座位，系统将为您计算观影体验评分'));
            if (this.manualPanel) this.manualPanel.hidden = true;
            return;
        }
        if (this.manualPanel) this.manualPanel.hidden = false;
        const total = this._element('div', `score-total-row grade-${score.grade}`);
        total.appendChild(this._element('strong', 'score-total-number', String(score.totalScore)));
        total.appendChild(this._element('span', 'score-total-max', ' / 100'));
        total.appendChild(this._element('span', 'score-grade', score.gradeText));
        this.details.appendChild(total);

        const rows = this._element('div', 'score-detail-rows');
        score.details.forEach(detail => {
            const row = this._element('div', 'score-detail-row');
            row.appendChild(this._element('span', 'score-detail-category', `${detail.emoji} ${detail.category}`));
            const value = this._element('span', 'score-detail-value');
            value.appendChild(this._element('span', 'score-detail-description', detail.description));
            value.appendChild(this._element('strong', '', `${detail.score} / ${detail.maxScore}`));
            row.appendChild(value);
            rows.appendChild(row);
        });
        this.details.appendChild(rows);

        if (score.recommendations.length > 0) {
            const suggestions = this._element('div', 'score-suggestions');
            score.recommendations.forEach(recommendation => {
                suggestions.appendChild(this._element('p', '', recommendation.message));
            });
            this.details.appendChild(suggestions);
        }
    }

    renderCombinedScore(score) {
        if (!this.combined) return;
        this.combined.replaceChildren();
        this.combined.appendChild(this._element(
            'div',
            'combined-score-meta',
            `系统评分 ${score.systemTotal} · 我的评分 ${score.manualTotal}`
        ));
        this.combined.appendChild(this._element(
            'div',
            'combined-score-total',
            `⭐ 综合评分：${score.totalScore} / 100 · ${score.gradeText}`
        ));
        this.combined.hidden = false;
    }

    _hideCombined() {
        if (!this.combined) return;
        this.combined.hidden = true;
        this.combined.replaceChildren();
    }

    _numberValue(id) {
        const value = Number.parseFloat(this.document.getElementById(id)?.value);
        return Number.isFinite(value) ? value : 5;
    }

    _element(tagName, className, text = '') {
        const element = this.document.createElement(tagName);
        element.className = className;
        element.textContent = text;
        return element;
    }
}

export default ScoringController;
