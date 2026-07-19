import { appendText } from '../commercial/CommerceView.js';

function element(id) {
    return document.getElementById(id);
}

export class CommercialDecisionSupportController {
    constructor({
        booking,
        onPartyTypeChange,
        onPopularityToggle
    }) {
        this.booking = booking;
        this.onPartyTypeChange = onPartyTypeChange;
        this.onPopularityToggle = onPopularityToggle;
        this._bind();
    }

    _bind() {
        element('party-type-options').addEventListener('click', event => {
            const button = event.target.closest('[data-party-type]');
            if (button && !button.disabled) this.onPartyTypeChange(button.dataset.partyType);
        });
        element('toggle-popularity').addEventListener('click', () => this.onPopularityToggle());
    }

    renderPartyTypes({ ticketItems, ticketQuantities, partyType }) {
        const result = this.booking.getPartyTypeOptions(ticketItems);
        if (!result.ok) return;
        result.value.forEach(option => {
            const button = element('party-type-options').querySelector(`[data-party-type="${option.id}"]`);
            if (!button) return;
            button.disabled = !option.allowed;
            button.setAttribute('aria-pressed', String(option.id === partyType));
        });
        const audienceRules = [];
        if (ticketQuantities.get('child') > 0) audienceRules.push('儿童票推荐避开前三排');
        if (ticketQuantities.get('senior') > 0) audienceRules.push('长者票推荐避开后三排');
        element('party-type-note').textContent = audienceRules.length > 0 ?
            audienceRules.join('；') : '同行方式会调整连座位置与排序';
    }

    renderPopularity(showPopularity, heatPeriod = 'week') {
        const button = element('toggle-popularity');
        button.setAttribute('aria-pressed', String(showPopularity));
        button.lastChild.textContent = showPopularity ? ' 隐藏热度参考' : ' 显示热度参考';
        element('popularity-legend').hidden = !showPopularity;
        const labels = {
            monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四',
            friday: '周五', saturday: '周六', sunday: '周日', week: '一周综合'
        };
        element('heat-period-controls').querySelectorAll('[data-heat-period]').forEach(periodButton => {
            periodButton.setAttribute('aria-pressed', String(periodButton.dataset.heatPeriod === heatPeriod));
        });
        element('heat-period-summary').textContent =
            `当前显示${labels[heatPeriod] || '一周综合'}热度；连续渐变根据座位位置和近期选择生成`;
    }

    renderGuide(draft) {
        const guide = element('seat-decision-guide');
        if (draft.selectedSeatIds.length === 0) {
            guide.hidden = true;
            return;
        }
        const result = this.booking.getSeatDecisionGuide(draft);
        if (!result.ok) {
            guide.hidden = true;
            return;
        }
        guide.hidden = false;
        element('seat-decision-grade').textContent = `${result.value.grade} · ${result.value.score}`;
        const metrics = element('seat-decision-metrics');
        metrics.replaceChildren();
        result.value.dimensions.forEach(item => {
            const row = document.createElement('div');
            appendText(row, 'span', item.label);
            const meter = document.createElement('meter');
            meter.min = 0;
            meter.max = 100;
            meter.value = item.score;
            meter.setAttribute('aria-label', `${item.label} ${item.score} 分`);
            const output = appendText(row, 'strong', String(item.score));
            output.setAttribute('aria-hidden', 'true');
            row.append(meter, output);
            metrics.append(row);
        });
        element('seat-decision-summary').textContent = result.value.summary;
    }
}

export default CommercialDecisionSupportController;
