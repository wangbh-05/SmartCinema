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

function sectionForColumn(columnIndex) {
    if (columnIndex < 4) return 'left';
    if (columnIndex < 14) return 'center';
    return 'right';
}

function zoneForSeat(rowIndex, sectionId) {
    if (rowIndex <= 1) return 'value';
    if (rowIndex >= 3 && rowIndex <= 6 && sectionId === 'center') return 'preferred';
    return 'standard';
}

function createSeatPlan() {
    const seats = [];
    ROW_LABELS.forEach((rowLabel, rowIndex) => {
        for (let columnIndex = 0; columnIndex < 18; columnIndex++) {
            const seatNumber = columnIndex + 1;
            const id = `${rowLabel}-${String(seatNumber).padStart(2, '0')}`;
            const sectionId = sectionForColumn(columnIndex);
            let kind = zoneForSeat(rowIndex, sectionId) === 'preferred' ? 'premium' : 'standard';
            let companionForSeatId = null;
            let normalizedSectionId = sectionId;

            if (rowLabel === 'H' && seatNumber === 1) {
                kind = 'wheelchair';
                normalizedSectionId = 'accessible-left';
            } else if (rowLabel === 'H' && seatNumber === 2) {
                kind = 'companion';
                companionForSeatId = 'H-01';
                normalizedSectionId = 'accessible-left';
            } else if (rowLabel === 'H' && seatNumber === 17) {
                kind = 'wheelchair';
                normalizedSectionId = 'accessible-right';
            } else if (rowLabel === 'H' && seatNumber === 18) {
                kind = 'companion';
                companionForSeatId = 'H-17';
                normalizedSectionId = 'accessible-right';
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
    const movie = createMovie({
        id: 'movie-echoes-beyond',
        title: '星际回响',
        originalTitle: 'Echoes Beyond',
        durationMinutes: 128,
        audienceRating: '12+',
        genres: ['科幻', '剧情'],
        synopsis: '一支深空测绘队收到来自失落殖民地的回声，在返航与追寻真相之间作出选择。',
        artwork: null
    });
    const cinema = createCinema({
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
    });
    const auditorium = createAuditorium({
        id: 'auditorium-imax-1',
        cinemaId: cinema.id,
        name: '1 号 IMAX 厅',
        seats: createSeatPlan(),
        accessibilityFeatures: [
            'wheelchair-spaces',
            'step-free-access',
            'hearing-assistance'
        ]
    });
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
    const showtimeDefinitions = [
        ['showtime-matinee', '12:40', 'pricing-matinee'],
        ['showtime-afternoon', '16:10', 'pricing-matinee'],
        ['showtime-prime', '19:30', 'pricing-prime'],
        ['showtime-late', '22:10', 'pricing-late']
    ];
    const showtimes = showtimeDefinitions.map(([id, time, pricingPolicyId]) => {
        const startsAt = isoAt(businessDate, time);
        return createShowtime({
            id: `${id}:${businessDate}`,
            movieId: movie.id,
            cinemaId: cinema.id,
            auditoriumId: auditorium.id,
            startsAt,
            endsAt: addMinutes(startsAt, movie.durationMinutes),
            format: 'IMAX-2D',
            language: '英语',
            subtitle: '中文字幕',
            accessibilityFeatures: [...auditorium.accessibilityFeatures],
            salesState: 'on-sale',
            pricingPolicyId,
            refundPolicyId: refundPolicy.id,
            bookingOpensAt: addMinutes(startsAt, -7 * 24 * 60),
            bookingClosesAt: addMinutes(startsAt, -10)
        });
    });

    return Object.freeze({
        businessDate,
        movies: Object.freeze({ [movie.id]: movie }),
        cinemas: Object.freeze({ [cinema.id]: cinema }),
        auditoriums: Object.freeze({ [auditorium.id]: auditorium }),
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
        );
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
