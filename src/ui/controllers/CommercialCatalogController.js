function element(id) {
    return document.getElementById(id);
}

function appendText(parent, tagName, text) {
    const child = document.createElement(tagName);
    child.textContent = String(text ?? '');
    parent.append(child);
    return child;
}

function dateLabels(businessDate) {
    const value = new Date(`${businessDate}T12:00:00.000+08:00`);
    return {
        date: new Intl.DateTimeFormat('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            timeZone: 'Asia/Shanghai'
        }).format(value),
        weekday: new Intl.DateTimeFormat('zh-CN', {
            weekday: 'short',
            timeZone: 'Asia/Shanghai'
        }).format(value)
    };
}

function businessDateOf(showtime) {
    return showtime.startsAt.slice(0, 10);
}

const CATALOG_SELECTION_KEYS = Object.freeze({
    movie: 'movieId',
    cinema: 'cinemaId',
    date: 'businessDate'
});

const CAROUSEL_TOLERANCE = 1;

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export class CommercialCatalogController {
    constructor({ navigation, showtimes, onSelect }) {
        this.navigation = navigation;
        this.showtimes = showtimes;
        this.onSelect = onSelect;
        this.renderFrame = null;
        this._bind('movie-list');
        this._bind('cinema-list');
        this._bind('date-list');
        this.carousels = ['movie-list', 'cinema-list', 'date-list'].map(id => this._bindCarousel(id));
        this.carouselByType = new Map(this.carousels.map(carousel => [carousel.type, carousel]));
    }

    list(selection, { bookableOnly = false } = {}) {
        return this.showtimes.filter(context =>
            context.movie.id === selection.movieId &&
            context.cinema.id === selection.cinemaId &&
            businessDateOf(context.showtime) === selection.businessDate &&
            (!bookableOnly || context.availability.bookable)
        );
    }

    bestMatch(type, value, selection) {
        const key = CATALOG_SELECTION_KEYS[type];
        if (!key) return null;
        const candidates = this.showtimes.filter(context =>
            context.availability.bookable && this._value(context, key) === value
        );
        const compatible = candidates.filter(context => {
            if (type === 'cinema') return context.movie.id === selection.movieId;
            if (type === 'date') {
                return context.movie.id === selection.movieId &&
                    context.cinema.id === selection.cinemaId;
            }
            return true;
        });
        const preferenceWeights = type === 'movie' ? { cinemaId: 2, businessDate: 1 } :
            (type === 'cinema' ? { businessDate: 1 } : {});
        return compatible.sort((left, right) => {
            const leftScore = Object.entries(preferenceWeights).reduce((score, [item, weight]) =>
                score + (this._value(left, item) === selection[item] ? weight : 0), 0);
            const rightScore = Object.entries(preferenceWeights).reduce((score, [item, weight]) =>
                score + (this._value(right, item) === selection[item] ? weight : 0), 0);
            if (rightScore !== leftScore) return rightScore - leftScore;
            return Date.parse(left.showtime.startsAt) - Date.parse(right.showtime.startsAt);
        })[0] || null;
    }

    render(selection) {
        this.selection = { ...selection };
        this._renderMovies(selection);
        this._renderCinemas(selection);
        this._renderDates(selection);
        if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
        this.renderFrame = requestAnimationFrame(() => {
            this.renderFrame = null;
            this.carousels.forEach(carousel => {
                this._measureCarousel(carousel);
                this._ensureVisible(carousel.type, selection[CATALOG_SELECTION_KEYS[carousel.type]], {
                    measure: false
                });
            });
        });
    }

    focus(type, value) {
        requestAnimationFrame(() => {
            const carousel = this.carouselByType.get(type);
            const target = carousel?.list.querySelector(
                `[data-catalog-type="${type}"][data-catalog-value="${value}"]`
            );
            if (!target) return;
            this._setRovingTarget(carousel.list, target);
            target.focus({ preventScroll: true });
            this._ensureVisible(type, value);
        });
    }

    _bind(id) {
        const list = element(id);
        list.addEventListener('click', event => {
            const button = event.target.closest('[data-catalog-type]');
            if (!button || button.disabled) return;
            if (event.detail === 0) {
                list.classList.add('is-keyboard-selecting');
                requestAnimationFrame(() => list.classList.remove('is-keyboard-selecting'));
            }
            this.onSelect({
                type: button.dataset.catalogType,
                value: button.dataset.catalogValue,
                trigger: button
            });
        });
        list.addEventListener('focusin', event => {
            const button = event.target.closest('.catalog-option');
            if (button && !button.disabled) this._setRovingTarget(list, button);
        });
        list.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const current = event.target.closest('.catalog-option');
            if (!current) return;
            const options = [...list.querySelectorAll('.catalog-option:not(:disabled)')];
            if (options.length === 0) return;
            const currentIndex = Math.max(0, options.indexOf(current));
            let nextIndex = currentIndex;
            if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
            if (event.key === 'ArrowRight') nextIndex = Math.min(options.length - 1, currentIndex + 1);
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = options.length - 1;
            const target = options[nextIndex];
            event.preventDefault();
            if (!target || target === current) return;
            this._setRovingTarget(list, target);
            target.focus({ preventScroll: true });
            this._ensureOptionVisible(id.replace('-list', ''), target);
        });
    }

    _bindCarousel(id) {
        const list = element(id);
        const type = id.replace('-list', '');
        const carousel = {
            id,
            type,
            list,
            wrapper: list.closest('.catalog-carousel'),
            control: list.closest('.catalog-control'),
            status: element(id.replace('-list', '-carousel-status')),
            previous: document.querySelector(
                `[data-carousel-target="${id}"][data-carousel-direction="previous"]`
            ),
            next: document.querySelector(
                `[data-carousel-target="${id}"][data-carousel-direction="next"]`
            ),
            frame: null,
            measurePending: false,
            measuredWidth: null,
            pages: [],
            targetPage: null
        };
        const scheduleUpdate = (measure = false) => {
            carousel.measurePending ||= measure;
            if (carousel.frame !== null) return;
            carousel.frame = requestAnimationFrame(() => {
                carousel.frame = null;
                const shouldMeasure = carousel.measurePending;
                carousel.measurePending = false;
                if (shouldMeasure) {
                    const previousWidth = carousel.measuredWidth;
                    this._measureCarousel(carousel);
                    const widthChanged = previousWidth !== null &&
                        Math.abs(previousWidth - carousel.measuredWidth) > CAROUSEL_TOLERANCE;
                    if (widthChanged) {
                        const value = this.selection?.[CATALOG_SELECTION_KEYS[type]];
                        if (value) this._ensureVisible(type, value, { measure: false });
                    }
                    return;
                }
                this._syncCarouselState(carousel);
            });
        };
        list.addEventListener('scroll', () => scheduleUpdate(), { passive: true });
        list.addEventListener('pointerdown', () => {
            carousel.targetPage = null;
        }, { passive: true });
        window.addEventListener('resize', () => scheduleUpdate(true));
        if ('ResizeObserver' in window) {
            carousel.resizeObserver = new ResizeObserver(() => scheduleUpdate(true));
            carousel.resizeObserver.observe(list);
        }
        [carousel.previous, carousel.next].forEach(button => {
            button.addEventListener('click', event => {
                const direction = button.dataset.carouselDirection === 'previous' ? -1 : 1;
                if (carousel.pages.length === 0) this._measureCarousel(carousel);
                const currentPage = carousel.targetPage ?? this._nearestPageIndex(carousel);
                const targetPage = clamp(currentPage + direction, 0, carousel.pages.length - 1);
                if (targetPage === currentPage) return;
                carousel.targetPage = targetPage;
                list.scrollTo({
                    left: carousel.pages[targetPage].left,
                    behavior: this._shouldReduceMotion() || event.detail === 0 ? 'auto' : 'smooth'
                });
                this._syncCarouselState(carousel);
            });
        });
        return carousel;
    }

    _measureCarousel(carousel) {
        const options = [...carousel.list.querySelectorAll('.catalog-option')];
        options.forEach(option => option.removeAttribute('data-carousel-snap'));
        if (options.length === 0) {
            carousel.pages = [];
            carousel.targetPage = null;
            carousel.status.textContent = '';
            carousel.previous.disabled = true;
            carousel.next.disabled = true;
            carousel.wrapper.classList.remove('is-scrollable');
            carousel.wrapper.classList.add('is-static');
            carousel.control.classList.remove('has-carousel-overflow');
            carousel.measuredWidth = carousel.list.clientWidth;
            return;
        }
        const pageSize = Math.max(
            1,
            Number.parseInt(getComputedStyle(carousel.list).getPropertyValue('--catalog-page-size'), 10) || 1
        );
        const pageCount = Math.ceil(options.length / pageSize);
        const isScrollable = pageCount > 1;
        carousel.wrapper.classList.toggle('is-scrollable', isScrollable);
        carousel.wrapper.classList.toggle('is-static', !isScrollable);
        carousel.control.classList.toggle('has-carousel-overflow', isScrollable);

        const maximumScroll = Math.max(0, carousel.list.scrollWidth - carousel.list.clientWidth);
        const finalStartIndex = Math.max(0, options.length - pageSize);
        const pages = [];
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            const startIndex = Math.min(pageIndex * pageSize, finalStartIndex);
            const isLastPage = pageIndex === pageCount - 1;
            const optionLeft = this._optionBounds(carousel.list, options[startIndex]).left;
            const left = isLastPage ? maximumScroll : clamp(optionLeft, 0, maximumScroll);
            if (pages.some(page => Math.abs(page.left - left) <= CAROUSEL_TOLERANCE)) continue;
            pages.push({ left, startIndex });
        }
        if (pages.length === 0) pages.push({ left: 0, startIndex: 0 });

        pages.forEach((page, pageIndex) => {
            if (pageIndex === pages.length - 1 && page.left >= maximumScroll - CAROUSEL_TOLERANCE) {
                options.at(-1).dataset.carouselSnap = 'end';
                return;
            }
            options[page.startIndex].dataset.carouselSnap = 'start';
        });
        carousel.pages = pages;
        carousel.targetPage = null;
        carousel.measuredWidth = carousel.list.clientWidth;
        this._syncCarouselState(carousel);
    }

    _syncCarouselState(carousel) {
        if (carousel.pages.length === 0) return;
        const nearestPage = this._nearestPageIndex(carousel);
        if (
            carousel.targetPage !== null &&
            Math.abs(carousel.list.scrollLeft - carousel.pages[carousel.targetPage].left) <=
                CAROUSEL_TOLERANCE
        ) {
            carousel.targetPage = null;
        }
        const activePage = carousel.targetPage ?? nearestPage;
        const isScrollable = carousel.pages.length > 1;
        carousel.status.textContent = isScrollable ?
            `第 ${activePage + 1} / ${carousel.pages.length} 页` : '';
        carousel.previous.disabled = !isScrollable || activePage === 0;
        carousel.next.disabled = !isScrollable || activePage === carousel.pages.length - 1;
    }

    _nearestPageIndex(carousel) {
        if (carousel.pages.length === 0) return 0;
        return carousel.pages.reduce((nearestIndex, page, index) => {
            const nearestDistance = Math.abs(
                carousel.list.scrollLeft - carousel.pages[nearestIndex].left
            );
            const distance = Math.abs(carousel.list.scrollLeft - page.left);
            return distance < nearestDistance ? index : nearestIndex;
        }, 0);
    }

    _ensureVisible(type, value, { measure = true } = {}) {
        const carousel = this.carouselByType.get(type);
        if (!carousel) return;
        const target = carousel.list.querySelector(
            `[data-catalog-type="${type}"][data-catalog-value="${value}"]`
        );
        if (!target) return;
        this._ensureOptionVisible(type, target, { measure });
    }

    _ensureOptionVisible(type, target, { measure = true } = {}) {
        const carousel = this.carouselByType.get(type);
        if (!carousel) return;
        if (measure) this._measureCarousel(carousel);
        const bounds = this._optionBounds(carousel.list, target);
        const viewportStart = carousel.list.scrollLeft;
        const viewportEnd = viewportStart + carousel.list.clientWidth;
        if (
            bounds.left >= viewportStart - CAROUSEL_TOLERANCE &&
            bounds.right <= viewportEnd + CAROUSEL_TOLERANCE
        ) {
            this._syncCarouselState(carousel);
            return;
        }
        const destination = carousel.pages.reduce((bestPage, page) => {
            const hiddenBefore = Math.max(0, page.left - bounds.left);
            const hiddenAfter = Math.max(0, bounds.right - (page.left + carousel.list.clientWidth));
            const score = hiddenBefore + hiddenAfter;
            const distance = Math.abs(page.left - carousel.list.scrollLeft);
            if (!bestPage || score < bestPage.score) return { page, score, distance };
            if (score === bestPage.score && distance < bestPage.distance) {
                return { page, score, distance };
            }
            return bestPage;
        }, null)?.page;
        if (!destination) return;
        carousel.targetPage = null;
        carousel.list.scrollTo({ left: destination.left, behavior: 'auto' });
        this._syncCarouselState(carousel);
    }

    _optionBounds(list, option) {
        const listRect = list.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();
        const left = list.scrollLeft + optionRect.left - listRect.left;
        return {
            left,
            right: left + optionRect.width
        };
    }

    _setRovingTarget(list, target) {
        list.querySelectorAll('.catalog-option').forEach(option => {
            option.tabIndex = option === target && !option.disabled ? 0 : -1;
        });
    }

    _normalizeRovingTarget(list) {
        const options = [...list.querySelectorAll('.catalog-option')];
        const target = options.find(option =>
            option.getAttribute('aria-pressed') === 'true' && !option.disabled
        ) || options.find(option => !option.disabled);
        if (target) this._setRovingTarget(list, target);
    }

    _shouldReduceMotion() {
        return document.documentElement.dataset.commerceMotion === 'reduce' ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    _renderMovies(selection) {
        const list = element('movie-list');
        this._renderOptions(list, this.navigation.movies.map(movie => ({
            type: 'movie',
            value: movie.id,
            selected: selection.movieId === movie.id,
            disabled: !this.bestMatch('movie', movie.id, selection),
            primary: movie.title,
            secondary: `${movie.genres[0]} · ${movie.durationMinutes} 分钟`
        })));
    }

    _renderCinemas(selection) {
        const list = element('cinema-list');
        this._renderOptions(list, this.navigation.cinemas.map(cinema => ({
            type: 'cinema',
            value: cinema.id,
            selected: selection.cinemaId === cinema.id,
            disabled: !this.bestMatch('cinema', cinema.id, selection),
            primary: cinema.name.replace('SmartCinema ', ''),
            secondary: `${cinema.city} · ${cinema.address.split('区')[0]}区`
        })));
    }

    _renderDates(selection) {
        const list = element('date-list');
        this._renderOptions(list, this.navigation.businessDates.map(businessDate => {
            const labels = dateLabels(businessDate);
            return {
                type: 'date',
                value: businessDate,
                selected: selection.businessDate === businessDate,
                disabled: !this.bestMatch('date', businessDate, selection),
                primary: labels.date,
                secondary: labels.weekday
            };
        }));
    }

    _renderOptions(list, entries) {
        const existing = new Map(
            [...list.querySelectorAll('.catalog-option')]
                .map(option => [option.dataset.catalogValue, option])
        );
        entries.forEach((entry, index) => {
            const button = existing.get(entry.value) || this._option(entry);
            existing.delete(entry.value);
            this._updateOption(button, entry);
            this._updateOptionCopy(button, 'strong', entry.primary);
            this._updateOptionCopy(button, 'small', entry.secondary);
            const current = list.children[index];
            if (current !== button) list.insertBefore(button, current || null);
        });
        existing.forEach(option => option.remove());
        this._normalizeRovingTarget(list);
    }

    _option({ type, value, selected, disabled }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'catalog-option';
        this._updateOption(button, { type, value, selected, disabled });
        return button;
    }

    _updateOption(button, { type, value, selected, disabled }) {
        button.dataset.catalogType = type;
        button.dataset.catalogValue = value;
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = disabled;
        button.tabIndex = selected && !disabled ? 0 : -1;
    }

    _updateOptionCopy(button, tagName, text) {
        let child = button.querySelector(`:scope > ${tagName}`);
        if (!child) child = appendText(button, tagName, text);
        if (child.textContent !== String(text ?? '')) child.textContent = String(text ?? '');
    }

    _value(context, key) {
        if (key === 'movieId') return context.movie.id;
        if (key === 'cinemaId') return context.cinema.id;
        return businessDateOf(context.showtime);
    }
}

export default CommercialCatalogController;
