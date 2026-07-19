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

export class CommercialCatalogController {
    constructor({ navigation, showtimes, onSelect }) {
        this.navigation = navigation;
        this.showtimes = showtimes;
        this.onSelect = onSelect;
        this._bind('movie-list');
        this._bind('cinema-list');
        this._bind('date-list');
        this.carousels = ['movie-list', 'cinema-list'].map(id => this._bindCarousel(id));
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
        const key = { movie: 'movieId', cinema: 'cinemaId', date: 'businessDate' }[type];
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
        requestAnimationFrame(() => {
            this._ensureVisible('movie', selection.movieId);
            this._ensureVisible('cinema', selection.cinemaId);
            this.carousels.forEach(carousel => this._updateCarousel(carousel));
        });
    }

    focus(type, value) {
        requestAnimationFrame(() => {
            const target = document.querySelector(
                `[data-catalog-type="${type}"][data-catalog-value="${value}"]`
            );
            this._ensureVisible(type, value);
            target?.focus();
        });
    }

    _bind(id) {
        element(id).addEventListener('click', event => {
            const button = event.target.closest('[data-catalog-type]');
            if (!button || button.disabled) return;
            this.onSelect({
                type: button.dataset.catalogType,
                value: button.dataset.catalogValue,
                trigger: button
            });
        });
    }

    _bindCarousel(id) {
        const list = element(id);
        const carousel = {
            id,
            list,
            status: element(id.replace('-list', '-carousel-status')),
            previous: document.querySelector(
                `[data-carousel-target="${id}"][data-carousel-direction="previous"]`
            ),
            next: document.querySelector(
                `[data-carousel-target="${id}"][data-carousel-direction="next"]`
            ),
            frame: null
        };
        const scheduleUpdate = () => {
            if (carousel.frame !== null) return;
            carousel.frame = requestAnimationFrame(() => {
                carousel.frame = null;
                this._updateCarousel(carousel);
            });
        };
        list.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);
        [carousel.previous, carousel.next].forEach(button => {
            button.addEventListener('click', event => {
                const direction = button.dataset.carouselDirection === 'previous' ? -1 : 1;
                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                list.scrollBy({
                    left: direction * list.clientWidth,
                    behavior: reducedMotion || event.detail === 0 ? 'auto' : 'smooth'
                });
            });
        });
        return carousel;
    }

    _updateCarousel(carousel) {
        const options = [...carousel.list.querySelectorAll('.catalog-option')];
        if (options.length === 0) {
            carousel.status.textContent = '';
            carousel.previous.disabled = true;
            carousel.next.disabled = true;
            return;
        }
        const styles = getComputedStyle(carousel.list);
        const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
        const itemWidth = options[0].getBoundingClientRect().width + gap;
        const firstIndex = Math.min(
            options.length - 1,
            Math.max(0, Math.round(carousel.list.scrollLeft / itemWidth))
        );
        const visibleCount = Math.max(1, Math.round((carousel.list.clientWidth + gap) / itemWidth));
        carousel.status.textContent = `${firstIndex + 1}–${Math.min(options.length, firstIndex + visibleCount)} / ${options.length}`;
        carousel.previous.disabled = carousel.list.scrollLeft <= 1;
        carousel.next.disabled = carousel.list.scrollLeft + carousel.list.clientWidth >=
            carousel.list.scrollWidth - 1;
    }

    _ensureVisible(type, value) {
        const target = document.querySelector(
            `[data-catalog-type="${type}"][data-catalog-value="${value}"]`
        );
        target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }

    _renderMovies(selection) {
        const list = element('movie-list');
        list.replaceChildren();
        this.navigation.movies.forEach(movie => {
            const button = this._option({
                type: 'movie',
                value: movie.id,
                selected: selection.movieId === movie.id,
                disabled: !this.bestMatch('movie', movie.id, selection)
            });
            appendText(button, 'strong', movie.title);
            appendText(button, 'small', `${movie.genres[0]} · ${movie.durationMinutes} 分钟`);
            list.append(button);
        });
    }

    _renderCinemas(selection) {
        const list = element('cinema-list');
        list.replaceChildren();
        this.navigation.cinemas.forEach(cinema => {
            const button = this._option({
                type: 'cinema',
                value: cinema.id,
                selected: selection.cinemaId === cinema.id,
                disabled: !this.bestMatch('cinema', cinema.id, selection)
            });
            appendText(button, 'strong', cinema.name.replace('SmartCinema ', ''));
            appendText(button, 'small', `${cinema.city} · ${cinema.address.split('区')[0]}区`);
            list.append(button);
        });
    }

    _renderDates(selection) {
        const list = element('date-list');
        list.replaceChildren();
        this.navigation.businessDates.forEach(businessDate => {
            const labels = dateLabels(businessDate);
            const button = this._option({
                type: 'date',
                value: businessDate,
                selected: selection.businessDate === businessDate,
                disabled: !this.bestMatch('date', businessDate, selection)
            });
            appendText(button, 'strong', labels.date);
            appendText(button, 'small', labels.weekday);
            list.append(button);
        });
    }

    _option({ type, value, selected, disabled }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'catalog-option';
        button.dataset.catalogType = type;
        button.dataset.catalogValue = value;
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = disabled;
        return button;
    }

    _value(context, key) {
        if (key === 'movieId') return context.movie.id;
        if (key === 'cinemaId') return context.cinema.id;
        return businessDateOf(context.showtime);
    }
}

export default CommercialCatalogController;
