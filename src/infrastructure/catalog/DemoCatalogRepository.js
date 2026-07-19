import { createAuditorium } from '../../domain/catalog/Auditorium.js';
import { createCinema } from '../../domain/catalog/Cinema.js';
import { createMovie } from '../../domain/catalog/Movie.js';
import { createPricingPolicy } from '../../domain/catalog/PricingPolicy.js';
import { createRefundPolicy } from '../../domain/catalog/RefundPolicy.js';
import { createShowtime } from '../../domain/catalog/Showtime.js';
import { createTicketType } from '../../domain/catalog/TicketType.js';

const ROW_LABELS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']);
const SHOWTIME_SLOTS = Object.freeze(['08:00', '11:00', '14:00', '17:00', '20:00', '23:00']);
const AUDITORIUMS_PER_CINEMA = 2;
const CINEMA_FORMATS = Object.freeze(['激光 2D', 'IMAX 2D', '2D']);
const MOVIE_PRESENTATIONS = Object.freeze([
    Object.freeze({ language: '英语', subtitle: '中文字幕' }),
    Object.freeze({ language: '日语', subtitle: '中文字幕' }),
    Object.freeze({ language: '英语', subtitle: '中文字幕' }),
    Object.freeze({ language: '英语', subtitle: '中文字幕' }),
    Object.freeze({ language: '英语', subtitle: '中文字幕' }),
    Object.freeze({ language: '英语', subtitle: '中文字幕' }),
    Object.freeze({ language: '英语', subtitle: '中文字幕' })
]);
const DAILY_MOVIE_ROTATIONS = Object.freeze([
    Object.freeze([
        Object.freeze([0, 1, 0, 2, 3, 2]),
        Object.freeze([1, 5, 1, 4, 6, 4]),
        Object.freeze([3, 5, 3, 6, 5, 6])
    ]),
    Object.freeze([
        Object.freeze([2, 3, 2, 4, 5, 4]),
        Object.freeze([1, 5, 1, 0, 2, 0]),
        Object.freeze([3, 6, 3, 6, 0, 5])
    ]),
    Object.freeze([
        Object.freeze([4, 5, 4, 6, 0, 6]),
        Object.freeze([1, 2, 1, 3, 4, 3]),
        Object.freeze([0, 2, 0, 5, 2, 5])
    ])
]);

function isoAt(businessDate, time) {
    return `${businessDate}T${time}:00.000+08:00`;
}

function addMinutes(isoString, minutes) {
    const shifted = new Date(Date.parse(isoString) + minutes * 60 * 1000 + 8 * 60 * 60 * 1000);
    return `${shifted.toISOString().slice(0, 19)}.000+08:00`;
}

function addDays(businessDate, days) {
    const value = new Date(`${businessDate}T12:00:00.000+08:00`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function scheduleCycleIndex(businessDate) {
    const dayOrdinal = Math.floor(Date.parse(`${businessDate}T00:00:00.000Z`) / 86400000);
    return ((dayOrdinal % DAILY_MOVIE_ROTATIONS.length) + DAILY_MOVIE_ROTATIONS.length) %
        DAILY_MOVIE_ROTATIONS.length;
}

function dailyShowtimeDefinitions(businessDate) {
    const rotation = DAILY_MOVIE_ROTATIONS[scheduleCycleIndex(businessDate)];
    return rotation.flatMap((movieIndices, cinemaIndex) =>
        [0, 1].flatMap(auditoriumLane =>
            movieIndices.map((_, slotIndex) => {
                const movieIndex = movieIndices[(slotIndex + auditoriumLane * 3) % movieIndices.length];
                return {
                    key: `c${cinemaIndex}-a${auditoriumLane}-s${slotIndex}-m${movieIndex}`,
                    movie: movieIndex,
                    cinema: cinemaIndex,
                    auditorium: cinemaIndex * AUDITORIUMS_PER_CINEMA + auditoriumLane,
                    time: SHOWTIME_SLOTS[slotIndex],
                    pricing: slotIndex === 0
                        ? 'pricing-matinee'
                        : slotIndex === SHOWTIME_SLOTS.length - 1 ? 'pricing-late' : 'pricing-prime',
                    format: CINEMA_FORMATS[cinemaIndex],
                    ...MOVIE_PRESENTATIONS[movieIndex]
                };
            })
        )
    );
}

function sectionForColumn(columnIndex, columnCount) {
    const sideWidth = Math.max(2, Math.round(columnCount / 6));
    if (columnIndex < sideWidth) return 'left';
    if (columnIndex < columnCount - sideWidth) return 'center';
    return 'right';
}

function zoneForSeat(rowIndex, sectionId) {
    if (rowIndex <= 1) return 'value';
    if (rowIndex >= 3 && rowIndex <= 6 && sectionId === 'center') return 'preferred';
    return 'standard';
}

function createSeatPlan(columnCount) {
    const seats = [];
    ROW_LABELS.forEach((rowLabel, rowIndex) => {
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
            const seatNumber = columnIndex + 1;
            const id = `${rowLabel}-${String(seatNumber).padStart(2, '0')}`;
            const sectionId = sectionForColumn(columnIndex, columnCount);
            let kind = zoneForSeat(rowIndex, sectionId) === 'preferred' ? 'premium' : 'standard';
            let companionForSeatId = null;
            let normalizedSectionId = sectionId;

            if (rowLabel === 'H' && seatNumber === 1) {
                kind = 'wheelchair';
                normalizedSectionId = 'left';
            } else if (rowLabel === 'H' && seatNumber === 2) {
                kind = 'companion';
                companionForSeatId = 'H-01';
                normalizedSectionId = 'left';
            } else if (rowLabel === 'H' && seatNumber === columnCount - 1) {
                kind = 'wheelchair';
                normalizedSectionId = 'right';
            } else if (rowLabel === 'H' && seatNumber === columnCount) {
                kind = 'companion';
                companionForSeatId = `H-${String(columnCount - 1).padStart(2, '0')}`;
                normalizedSectionId = 'right';
            }

            seats.push({
                id,
                rowIndex,
                columnIndex,
                rowLabel,
                seatNumber,
                label: `${rowLabel}排${seatNumber}座`,
                sectionId: normalizedSectionId,
                zoneId: zoneForSeat(rowIndex, sectionId),
                kind,
                companionForSeatId,
                stepFree: rowLabel === 'H'
            });
        }
    });
    return seats;
}

export function createDemoCatalog(businessDate) {
    const movies = [
        createMovie({
            id: 'movie-interstellar',
            title: '星际穿越',
            originalTitle: 'Interstellar',
            durationMinutes: 169,
            audienceRating: '建议 12+',
            genres: ['科幻', '冒险'],
            synopsis: '地球生存环境持续恶化，一组宇航员穿越虫洞，为人类寻找新的家园。',
            artwork: 'cosmic-orbit',
            posterUrl: './public/images/posters/interstellar.jpg'
        }),
        createMovie({
            id: 'movie-your-name',
            title: '你的名字',
            originalTitle: 'Your Name.',
            durationMinutes: 106,
            audienceRating: '建议 12+',
            genres: ['动画', '爱情'],
            synopsis: '生活在东京与山间小镇的两名高中生意外交换身体，并试图跨越时空找到彼此。',
            artwork: 'twilight-comet',
            posterUrl: './public/images/posters/your-name.jpg'
        }),
        createMovie({
            id: 'movie-flipped',
            title: '怦然心动',
            originalTitle: 'Flipped',
            durationMinutes: 90,
            audienceRating: '全年龄',
            genres: ['剧情', '爱情'],
            synopsis: '一对青梅竹马从各自视角重新认识彼此，也在成长中理解真诚与勇气。',
            artwork: 'sycamore-sun',
            posterUrl: './public/images/posters/flipped.jpg'
        }),
        createMovie({
            id: 'movie-scent-of-a-woman',
            title: '闻香识女人',
            originalTitle: 'Scent of a Woman',
            durationMinutes: 156,
            audienceRating: '建议 16+',
            genres: ['剧情'],
            synopsis: '一名学生陪伴失明的退役军官度过周末，两人在冲突与理解中改变彼此的人生。',
            artwork: 'tango-amber',
            posterUrl: './public/images/posters/scent-of-a-woman.jpg'
        }),
        createMovie({
            id: 'movie-harry-potter-philosophers-stone',
            title: '哈利·波特与魔法石',
            originalTitle: "Harry Potter and the Philosopher's Stone",
            durationMinutes: 152,
            audienceRating: '建议 12+',
            genres: ['奇幻', '冒险'],
            synopsis: '寄人篱下的男孩得知自己是巫师，并在魔法学校展开一段改变命运的冒险。',
            artwork: 'magic-castle',
            posterUrl: './public/images/posters/harry-potter-philosophers-stone.jpg'
        }),
        createMovie({
            id: 'movie-zootopia',
            title: '疯狂动物城',
            originalTitle: 'Zootopia',
            durationMinutes: 108,
            audienceRating: '全年龄',
            genres: ['动画', '喜剧'],
            synopsis: '初任警官的兔子与善于周旋的狐狸结成搭档，共同调查城市中的离奇案件。',
            artwork: 'city-neon',
            posterUrl: './public/images/posters/zootopia.jpg'
        }),
        createMovie({
            id: 'movie-truman-show',
            title: '楚门的世界',
            originalTitle: 'The Truman Show',
            durationMinutes: 104,
            audienceRating: '建议 12+',
            genres: ['剧情', '喜剧'],
            synopsis: '一名普通人逐渐发现自己的生活可能是一场全天候直播，并开始追寻真实世界。',
            artwork: 'studio-sky',
            posterUrl: './public/images/posters/the-truman-show.jpg'
        })
    ];
    const cinemas = [
        createCinema({
            id: 'cinema-lumen-center',
            name: 'SmartCinema 五道口',
            city: '北京',
            address: '海淀区成府路 28 号 B1 层',
            serviceFeatures: [
                'mobile-ticket',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createCinema({
            id: 'cinema-riverside',
            name: 'SmartCinema 清河',
            city: '北京',
            address: '海淀区清河中街 68 号 7-8 层',
            serviceFeatures: [
                'mobile-ticket',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createCinema({
            id: 'cinema-starlight-plaza',
            name: 'SmartCinema 中关村',
            city: '北京',
            address: '海淀区中关村大街 19 号 B1 层',
            serviceFeatures: [
                'mobile-ticket',
                'step-free-access',
                'hearing-assistance'
            ]
        })
    ];
    const auditoriums = [
        createAuditorium({
            id: 'auditorium-lumen-5',
            cinemaId: cinemas[0].id,
            name: '5 号激光厅',
            seats: createSeatPlan(20),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-lumen-6',
            cinemaId: cinemas[0].id,
            name: '6 号激光厅',
            seats: createSeatPlan(20),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-riverside-imax',
            cinemaId: cinemas[1].id,
            name: 'IMAX 厅',
            seats: createSeatPlan(30),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-riverside-3',
            cinemaId: cinemas[1].id,
            name: '3 号巨幕厅',
            seats: createSeatPlan(30),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-starlight-2',
            cinemaId: cinemas[2].id,
            name: '2 号厅',
            seats: createSeatPlan(10),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-starlight-3',
            cinemaId: cinemas[2].id,
            name: '3 号厅',
            seats: createSeatPlan(10),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        })
    ];
    const ticketTypes = [
        createTicketType({
            id: 'adult',
            label: '成人票',
            description: '标准票',
            priceAdjustment: 0
        }),
        createTicketType({
            id: 'child',
            label: '儿童票',
            description: '12 周岁以下',
            eligibilityNote: '入场时可能需要年龄证明',
            priceAdjustment: -1500
        }),
        createTicketType({
            id: 'student',
            label: '学生票',
            description: '全日制学生',
            eligibilityNote: '入场时请出示有效学生证',
            priceAdjustment: -1000
        }),
        createTicketType({
            id: 'senior',
            label: '银发票',
            description: '60 周岁及以上',
            eligibilityNote: '入场时可能需要年龄证明',
            priceAdjustment: -1200
        })
    ];
    const pricingPolicies = [
        createPricingPolicy({
            id: 'pricing-matinee',
            currency: 'CNY',
            baseTicketPrice: 4900,
            serviceFeePerTicket: 300,
            seatZoneSurcharges: { value: 0, standard: 0, preferred: 800 }
        }),
        createPricingPolicy({
            id: 'pricing-prime',
            currency: 'CNY',
            baseTicketPrice: 6800,
            serviceFeePerTicket: 300,
            seatZoneSurcharges: { value: 0, standard: 0, preferred: 1200 }
        }),
        createPricingPolicy({
            id: 'pricing-late',
            currency: 'CNY',
            baseTicketPrice: 5200,
            serviceFeePerTicket: 300,
            seatZoneSurcharges: { value: 0, standard: 0, preferred: 800 }
        })
    ];
    const refundPolicy = createRefundPolicy({
        id: 'refund-standard',
        refundable: true,
        cutoffMinutesBeforeShowtime: 60,
        feeAmount: 500,
        currency: 'CNY',
        summary: '开场前 60 分钟可整单退票，每单收取 5 元服务费'
    });
    const businessDates = Object.freeze([0, 1, 2].map(offset => addDays(businessDate, offset)));
    const showtimes = businessDates.flatMap(date => dailyShowtimeDefinitions(date).map(definition => {
        const movie = movies[definition.movie];
        const cinema = cinemas[definition.cinema];
        const auditorium = auditoriums[definition.auditorium];
        const startsAt = isoAt(date, definition.time);
        return createShowtime({
            id: `showtime:${definition.key}:${date}`,
            movieId: movie.id,
            cinemaId: cinema.id,
            auditoriumId: auditorium.id,
            startsAt,
            endsAt: addMinutes(startsAt, movie.durationMinutes),
            format: definition.format,
            language: definition.language,
            subtitle: definition.subtitle,
            accessibilityFeatures: [...auditorium.accessibilityFeatures],
            salesState: 'on-sale',
            pricingPolicyId: definition.pricing,
            refundPolicyId: refundPolicy.id,
            bookingOpensAt: addMinutes(startsAt, -7 * 24 * 60),
            bookingClosesAt: addMinutes(startsAt, -10)
        });
    }));

    return Object.freeze({
        businessDate,
        businessDates,
        movies: Object.freeze(Object.fromEntries(movies.map(item => [item.id, item]))),
        cinemas: Object.freeze(Object.fromEntries(cinemas.map(item => [item.id, item]))),
        auditoriums: Object.freeze(Object.fromEntries(auditoriums.map(item => [item.id, item]))),
        ticketTypes: Object.freeze(Object.fromEntries(ticketTypes.map(item => [item.id, item]))),
        pricingPolicies: Object.freeze(Object.fromEntries(pricingPolicies.map(item => [item.id, item]))),
        refundPolicies: Object.freeze({ [refundPolicy.id]: refundPolicy }),
        showtimes: Object.freeze(Object.fromEntries(showtimes.map(item => [item.id, item])))
    });
}

export class DemoCatalogRepository {
    constructor(catalog) {
        this.catalog = catalog;
    }

    listShowtimes({ movieId = null, cinemaId = null, businessDate = null } = {}) {
        return Object.values(this.catalog.showtimes).filter(showtime =>
            (movieId === null || showtime.movieId === movieId) &&
            (cinemaId === null || showtime.cinemaId === cinemaId) &&
            (businessDate === null || showtime.startsAt.startsWith(businessDate))
        ).sort((left, right) => {
            const timeDifference = Date.parse(left.startsAt) - Date.parse(right.startsAt);
            return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
        });
    }

    listMovies() {
        return Object.values(this.catalog.movies);
    }

    listCinemas() {
        return Object.values(this.catalog.cinemas);
    }

    listBusinessDates() {
        return [...this.catalog.businessDates];
    }

    getMovie(id) {
        return this.catalog.movies[id] || null;
    }

    getCinema(id) {
        return this.catalog.cinemas[id] || null;
    }

    getAuditorium(id) {
        return this.catalog.auditoriums[id] || null;
    }

    getShowtime(id) {
        return this.catalog.showtimes[id] || null;
    }

    listTicketTypes() {
        return Object.values(this.catalog.ticketTypes);
    }

    getTicketTypesById() {
        return this.catalog.ticketTypes;
    }

    getPricingPolicy(id) {
        return this.catalog.pricingPolicies[id] || null;
    }

    getRefundPolicy(id) {
        return this.catalog.refundPolicies[id] || null;
    }
}

export default DemoCatalogRepository;
