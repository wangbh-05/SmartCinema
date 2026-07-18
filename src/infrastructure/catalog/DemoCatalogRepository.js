import { createAuditorium } from '../../domain/catalog/Auditorium.js';
import { createCinema } from '../../domain/catalog/Cinema.js';
import { createMovie } from '../../domain/catalog/Movie.js';
import { createPricingPolicy } from '../../domain/catalog/PricingPolicy.js';
import { createRefundPolicy } from '../../domain/catalog/RefundPolicy.js';
import { createShowtime } from '../../domain/catalog/Showtime.js';
import { createTicketType } from '../../domain/catalog/TicketType.js';

const ROW_LABELS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']);

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
            id: 'movie-echoes-beyond',
            title: '星际回响',
            originalTitle: 'Echoes Beyond',
            durationMinutes: 128,
            audienceRating: '12+',
            genres: ['科幻', '剧情'],
            synopsis: '一支深空测绘队收到来自失落殖民地的回声，在返航与追寻真相之间作出选择。',
            artwork: 'cosmic-orbit'
        }),
        createMovie({
            id: 'movie-letters-in-rain',
            title: '雨夜来信',
            originalTitle: 'Letters in the Rain',
            durationMinutes: 103,
            audienceRating: '全年龄',
            genres: ['剧情', '爱情'],
            synopsis: '两封寄错地址的信，让一对素未谋面的城市夜归人逐渐走进彼此的生活。',
            artwork: 'rain-letter'
        }),
        createMovie({
            id: 'movie-little-planet',
            title: '小小星球',
            originalTitle: 'The Little Planet',
            durationMinutes: 96,
            audienceRating: '全年龄',
            genres: ['动画', '家庭'],
            synopsis: '一颗迷路的小行星和地球女孩组成临时搭档，寻找各自在宇宙中的家。',
            artwork: 'little-planet'
        })
    ];
    const cinemas = [
        createCinema({
            id: 'cinema-lumen-center',
            name: 'SmartCinema 光影中心',
            city: '上海',
            address: '浦东新区示范路 88 号 6 层',
            serviceFeatures: [
                'mobile-ticket',
                'step-free-access',
                'free-parking-2h',
                'hearing-assistance'
            ]
        }),
        createCinema({
            id: 'cinema-riverside',
            name: 'SmartCinema 滨江里',
            city: '上海',
            address: '徐汇区滨江示范路 16 号 4 层',
            serviceFeatures: [
                'mobile-ticket',
                'step-free-access',
                'metro-connected',
                'hearing-assistance'
            ]
        })
    ];
    const auditoriums = [
        createAuditorium({
            id: 'auditorium-imax-1',
            cinemaId: cinemas[0].id,
            name: '1 号 IMAX 中厅',
            seats: createSeatPlan(20),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-dolby-3',
            cinemaId: cinemas[0].id,
            name: '3 号杜比小厅',
            seats: createSeatPlan(10),
            accessibilityFeatures: [
                'wheelchair-spaces',
                'step-free-access',
                'hearing-assistance'
            ]
        }),
        createAuditorium({
            id: 'auditorium-riverside-6',
            cinemaId: cinemas[1].id,
            name: '6 号激光大厅',
            seats: createSeatPlan(30),
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
            label: '长者票',
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
    const showtimeDefinitions = [
        { key: 'echo-lumen-day', movie: 0, cinema: 0, auditorium: 0, time: '12:40', pricing: 'pricing-matinee', format: 'IMAX-2D', language: '英语', subtitle: '中文字幕' },
        { key: 'rain-lumen', movie: 1, cinema: 0, auditorium: 1, time: '15:20', pricing: 'pricing-matinee', format: '杜比全景声', language: '普通话', subtitle: '' },
        { key: 'planet-lumen', movie: 2, cinema: 0, auditorium: 1, time: '10:30', pricing: 'pricing-matinee', format: '2D', language: '普通话', subtitle: '' },
        { key: 'echo-riverside', movie: 0, cinema: 1, auditorium: 2, time: '18:40', pricing: 'pricing-prime', format: '激光 2D', language: '英语', subtitle: '中文字幕' },
        { key: 'rain-riverside', movie: 1, cinema: 1, auditorium: 2, time: '20:10', pricing: 'pricing-prime', format: '激光 2D', language: '普通话', subtitle: '' },
        { key: 'planet-riverside', movie: 2, cinema: 1, auditorium: 2, time: '13:10', pricing: 'pricing-matinee', format: '激光 2D', language: '普通话', subtitle: '' },
        { key: 'echo-lumen-prime', movie: 0, cinema: 0, auditorium: 0, time: '19:30', pricing: 'pricing-prime', format: 'IMAX-2D', language: '英语', subtitle: '中文字幕' },
        { key: 'echo-lumen-late', movie: 0, cinema: 0, auditorium: 0, time: '22:10', pricing: 'pricing-late', format: 'IMAX-2D', language: '英语', subtitle: '中文字幕' }
    ];
    const showtimes = businessDates.flatMap(date => showtimeDefinitions.map(definition => {
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
