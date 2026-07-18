export class RecommendationController {
    constructor({
        controller,
        document,
        getSeatLayout,
        requireAuth,
        onPreview,
        onApply,
        onError
    }) {
        if (!controller || !document || typeof getSeatLayout !== 'function') {
            throw new TypeError('RecommendationController 缺少必要依赖');
        }
        this.controller = controller;
        this.document = document;
        this.getSeatLayout = getSeatLayout;
        this.requireAuth = requireAuth;
        this.onPreview = onPreview;
        this.onApply = onApply;
        this.onError = onError;
        this.form = document.getElementById('recommend-form');
        this.groupSizeInput = document.getElementById('group-size');
        this.result = document.getElementById('recommend-result');
        this.bound = false;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;
        this.form?.addEventListener('submit', event => {
            event.preventDefault();
            this.submit();
        });
        this.groupSizeInput?.addEventListener('change', () => this.updateForm());
        this.groupSizeInput?.addEventListener('input', () => this.updateForm());
        this.updateForm();
    }

    updateForm() {
        const groupSize = Number.parseInt(this.groupSizeInput?.value, 10) || 1;
        const multiplePeople = groupSize >= 2;
        this._setHidden('age-select-container', multiplePeople);
        this._setHidden('age-check-container', !multiplePeople);
        this._setHidden('name-single-wrapper', multiplePeople);
        this._setHidden('name-group-wrapper', !multiplePeople);
        const hint = this.document.getElementById('member-count-hint');
        if (hint) hint.textContent = String(groupSize);

        const movieSelect = this.document.getElementById('movie-type');
        if (!movieSelect) return;
        movieSelect.replaceChildren(...this._movieTypeOptions(groupSize).map(option => {
            const element = this.document.createElement('option');
            element.value = option.value;
            element.textContent = option.label;
            return element;
        }));
    }

    getSelectedAges() {
        const multiplePeople = Number.parseInt(this.groupSizeInput?.value, 10) >= 2;
        if (multiplePeople) {
            return [...this.document.querySelectorAll('.age-check:checked')]
                .map(control => control.value)
                .join(',');
        }
        return this.document.getElementById('age-group')?.value || '';
    }

    submit() {
        if (this.requireAuth && !this.requireAuth()) return false;
        const input = this._readInput();
        if (!input.ok) {
            this.onError?.(input.message);
            return false;
        }
        const result = this.controller.recommendSeats(this.getSeatLayout(), input.value);
        if (!result.ok) {
            this.onError?.(result.error.message);
            return false;
        }
        this.onPreview?.(result.value.recommendation.seats);
        this.render(result.value.recommendation, input.value.userNames);
        return true;
    }

    apply() {
        const recommendation = this.controller.getState()?.recommendation;
        if (!recommendation) {
            this.onError?.('推荐已失效，请重新执行推荐');
            return false;
        }
        this.onApply?.(recommendation.seats);
        return true;
    }

    render(recommendation, userNames) {
        if (!this.result) return;
        this.result.replaceChildren();
        this.result.appendChild(this._element('h4', '推荐结果'));
        this.result.appendChild(this._element('p', userNames.join('、')));
        recommendation.reason.split('\n').forEach(line => {
            this.result.appendChild(this._element('p', line));
        });
        const button = this._element('button', '应用推荐');
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.addEventListener('click', () => this.apply());
        this.result.appendChild(button);
        this.result.classList.add('active');
    }

    clear() {
        if (!this.result) return;
        this.result.replaceChildren();
        this.result.classList.remove('active');
    }

    _readInput() {
        const groupSize = Number.parseInt(this.groupSizeInput?.value, 10);
        const ageGroup = this.getSelectedAges();
        const movieType = this.document.getElementById('movie-type')?.value || '';
        if (!ageGroup || !movieType || !Number.isInteger(groupSize) || groupSize < 1) {
            return { ok: false, message: '请填写完整的推荐参数（人数→年龄段→观影类型→姓名）' };
        }
        let userNames;
        if (groupSize === 1) {
            const name = this.document.getElementById('user-name')?.value?.trim();
            if (!name) return { ok: false, message: '请输入您的姓名' };
            userNames = [name];
        } else {
            const rawNames = this.document.getElementById('member-names')?.value?.trim();
            if (!rawNames) return { ok: false, message: '请输入成员姓名' };
            userNames = rawNames.split('\n').map(name => name.trim()).filter(Boolean);
            if (userNames.length < groupSize) {
                return {
                    ok: false,
                    message: `请输入至少 ${groupSize} 位成员的姓名（当前 ${userNames.length} 人）`
                };
            }
        }
        return {
            ok: true,
            value: { ageGroup, groupSize, movieType, userNames }
        };
    }

    _movieTypeOptions(groupSize) {
        const options = [{ value: '', label: '-- 选择类型 --' }];
        if (groupSize === 1) options.push({ value: 'solo', label: '🎬 个人观影' });
        else if (groupSize === 2) {
            options.push(
                { value: 'couple', label: '💑 情侣' },
                { value: 'friends', label: '👫 朋友' },
                { value: 'parent_child', label: '👨‍👧 亲子' }
            );
        } else if (groupSize <= 4) {
            options.push(
                { value: 'family', label: '👨‍👩‍👧 家庭' },
                { value: 'friends', label: '👫 朋友' }
            );
        } else if (groupSize === 5) {
            options.push(
                { value: 'family', label: '👨‍👩‍👧 家庭' },
                { value: 'group', label: '👥 团体' },
                { value: 'friends', label: '👫 朋友' }
            );
        } else {
            options.push(
                { value: 'group', label: '👥 团体' },
                { value: 'friends', label: '👫 朋友' }
            );
        }
        return options;
    }

    _setHidden(id, hidden) {
        const element = this.document.getElementById(id);
        if (element) element.hidden = hidden;
    }

    _element(tagName, text) {
        const element = this.document.createElement(tagName);
        element.textContent = text;
        return element;
    }
}

export default RecommendationController;
