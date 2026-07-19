import { createMoney } from '../src/domain/Money.js';
import { createAuditorium } from '../src/domain/catalog/Auditorium.js';
import { createCinema } from '../src/domain/catalog/Cinema.js';
import { createMovie } from '../src/domain/catalog/Movie.js';
import { createPricingPolicy } from '../src/domain/catalog/PricingPolicy.js';
import { createRefundPolicy } from '../src/domain/catalog/RefundPolicy.js';
import { createShowtime } from '../src/domain/catalog/Showtime.js';
import { createTicketType } from '../src/domain/catalog/TicketType.js';
import {
    createBookingDraft,
    isDraftReadyForHold,
    replaceDraftSeats
} from '../src/domain/booking/BookingDraft.js';
import {
    consumeBookingHold,
    expireBookingHold,
    placeBookingHold,
    releaseBookingHold
} from '../src/domain/booking/HoldBooking.js';
import { quoteBooking } from '../src/domain/booking/PricingQuote.js';
import {
    createSeatPopularityMap,
    evaluateSeatDecision
} from '../src/domain/booking/SeatDecisionGuide.js';
import { validateSeatSelection } from '../src/domain/booking/SeatSelectionPolicy.js';
import {
    createShowtimeInventory,
    reserveSeats
} from '../src/domain/booking/ShowtimeInventory.js';
import {
    createCommercialOrder,
    getCommercialCancellationEligibility
} from '../src/domain/order/CommercialOrder.js';
import { cancelCommercialBooking } from '../src/domain/order/CancelCommercialBooking.js';
import {
    createDemoCatalog,
    DemoCatalogRepository
} from '../src/infrastructure/catalog/DemoCatalogRepository.js';

const NOW = '2026-07-18T10:00:00.000Z';
const LATER = '2026-07-18T10:10:00.000Z';

class TestCommercialDomain {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        try {
            fn();
            this.passed++;
            console.log(`✓ ${name}`);
        } catch (error) {
            this.failed++;
            console.error(`✗ ${name}`, error.message);
        }
    }

    assertEqual(actual, expected, message = '') {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }

    assertTrue(value, message = '') {
        if (!value) throw new Error(`Expected true. ${message}`);
    }

    assertFalse(value, message = '') {
        if (value) throw new Error(`Expected false. ${message}`);
    }

    assertThrows(fn, message = '') {
        let threw = false;
        try {
            fn();
        } catch {
            threw = true;
        }
        if (!threw) throw new Error(`Expected function to throw. ${message}`);
    }

    runAll() {
        console.log('\n========== Commercial Booking Domain 测试 ==========\n');

        this.test('Money 应只接受非负整数分', () => {
            const money = createMoney(6800, 'CNY');
            this.assertEqual(money.amount, 6800);
            this.assertTrue(Object.isFrozen(money));
            this.assertThrows(() => createMoney(68.5, 'CNY'));
            this.assertThrows(() => createMoney(-1, 'CNY'));
        });

        this.test('Movie 海报应接受本地相对地址并拒绝非 HTTP(S) 协议', () => {
            const movie = createMovie({
                id: 'movie-poster-contract',
                title: '海报契约',
                durationMinutes: 90,
                posterUrl: ' ./public/images/posters/example.jpg '
            });
            this.assertEqual(movie.posterUrl, './public/images/posters/example.jpg');
            this.assertThrows(() => createMovie({
                ...movie,
                posterUrl: 'javascript:alert(1)'
            }));
            this.assertThrows(() => createMovie({
                ...movie,
                posterUrl: '   '
            }));
        });

        this.test('Catalog 场次应包含完整购买上下文并校验时间', () => {
            const fixture = this._fixture();
            this.assertEqual(fixture.showtime.movieId, fixture.movie.id);
            this.assertEqual(fixture.showtime.cinemaId, fixture.cinema.id);
            this.assertEqual(fixture.showtime.auditoriumId, fixture.auditorium.id);
            this.assertEqual(fixture.showtime.format, 'IMAX-2D');
            this.assertThrows(() => createShowtime({
                ...fixture.showtime,
                endsAt: fixture.showtime.startsAt
            }));
        });

        this.test('BookingDraft 应限制 1–20 张票且 9 张起必须使用多人同行', () => {
            const draft = this._draft();
            this.assertEqual(draft.ticketCount, 2);
            this.assertEqual(draft.partyType, 'family');
            this.assertFalse(isDraftReadyForHold(draft));
            const complete = replaceDraftSeats(draft, ['A-2', 'A-3'], LATER);
            this.assertTrue(complete.ok);
            this.assertTrue(isDraftReadyForHold(complete.value));
            this.assertFalse(replaceDraftSeats(draft, ['A-1', 'A-2', 'A-3'], LATER).ok);
            this.assertThrows(() => createBookingDraft({
                ...draft,
                ticketItems: [{ ticketTypeId: 'adult', quantity: 21 }]
            }));
            this.assertThrows(() => createBookingDraft({
                ...draft,
                partyType: 'solo'
            }));
            this.assertThrows(() => createBookingDraft({
                ...draft,
                ticketItems: [{ ticketTypeId: 'adult', quantity: 9 }],
                partyType: 'family'
            }));
            const group = createBookingDraft({
                ...draft,
                ticketItems: [{ ticketTypeId: 'adult', quantity: 20 }],
                partyType: 'group'
            });
            this.assertEqual(group.ticketCount, 20);
        });

        this.test('PricingQuote 应从票种、价格区和服务费重算总价', () => {
            const fixture = this._fixture();
            const draft = this._completeDraft(['A-2', 'A-3']);
            const quote = quoteBooking({
                draft,
                auditorium: fixture.auditorium,
                ticketTypesById: fixture.ticketTypesById,
                pricingPolicy: fixture.pricingPolicy,
                quotedAt: NOW
            });
            this.assertTrue(quote.ok);
            this.assertEqual(quote.value.ticketSubtotal.amount, 10500);
            this.assertEqual(quote.value.seatSurcharge.amount, 1000);
            this.assertEqual(quote.value.serviceFee.amount, 600);
            this.assertEqual(quote.value.total.amount, 12100);
        });

        this.test('座位决策辅助应给出四维体验并生成文字可解释的热度层', () => {
            const catalog = createDemoCatalog('2026-07-18');
            const repository = new DemoCatalogRepository(catalog);
            const showtime = repository.getShowtime('showtime:c0-a0-s1-m1:2026-07-18');
            const auditorium = repository.getAuditorium(showtime.auditoriumId);
            const inventory = createShowtimeInventory({
                showtimeId: showtime.id,
                soldSeatIds: ['D-09', 'D-12', 'F-08'],
                updatedAt: NOW
            });
            const pricingPolicy = repository.getPricingPolicy(showtime.pricingPolicyId);
            const central = evaluateSeatDecision({
                auditorium,
                seatIds: ['F-10', 'F-11'],
                inventory,
                pricingPolicy
            });
            const edge = evaluateSeatDecision({
                auditorium,
                seatIds: ['A-01', 'A-02'],
                inventory,
                pricingPolicy
            });
            this.assertEqual(central.dimensions.length, 4);
            this.assertTrue(central.score > edge.score);
            this.assertTrue(['极佳', '优秀', '舒适', '基础'].includes(central.grade));

            const popularity = createSeatPopularityMap({ auditorium, inventory });
            this.assertEqual(Object.keys(popularity).length, 200);
            const levels = new Set(Object.values(popularity).map(item => item.level));
            this.assertTrue(levels.has('hot'));
            this.assertTrue(levels.has('cool'));
        });

        this.test('SeatSelectionPolicy 应拒绝数量不匹配、不可用和跨区选择', () => {
            const fixture = this._fixture();
            const inventory = createShowtimeInventory({
                showtimeId: fixture.showtime.id,
                soldSeatIds: ['A-4'],
                updatedAt: NOW
            });
            const countMismatch = validateSeatSelection({
                draft: this._draft(),
                auditorium: fixture.auditorium,
                inventory
            });
            this.assertEqual(countMismatch.error.code, 'TICKET_COUNT_MISMATCH');

            const unavailable = validateSeatSelection({
                draft: this._completeDraft(['A-3', 'A-4']),
                auditorium: fixture.auditorium,
                inventory
            });
            this.assertEqual(unavailable.error.code, 'SEAT_UNAVAILABLE');

            const crossSection = validateSeatSelection({
                draft: this._completeDraft(['A-2', 'B-1']),
                auditorium: fixture.auditorium,
                inventory
            });
            this.assertEqual(crossSection.error.code, 'CROSS_SECTION_SELECTION');
        });

        this.test('SeatSelectionPolicy 应识别本次选择制造的有界孤座', () => {
            const fixture = this._fixture();
            const inventory = createShowtimeInventory({
                showtimeId: fixture.showtime.id,
                soldSeatIds: ['A-1', 'A-5'],
                updatedAt: NOW
            });
            const result = validateSeatSelection({
                draft: this._completeDraft(['A-2', 'A-3']),
                auditorium: fixture.auditorium,
                inventory
            });
            this.assertFalse(result.ok);
            this.assertEqual(result.error.code, 'ORPHAN_SEAT_CREATED');
            this.assertEqual(result.error.details.seatIds[0], 'A-4');
        });

        this.test('SeatSelectionPolicy 不应把场次原有孤座归因于本次选择', () => {
            const fixture = this._fixture();
            const inventory = createShowtimeInventory({
                showtimeId: fixture.showtime.id,
                soldSeatIds: ['A-1', 'A-3'],
                updatedAt: NOW
            });
            const result = validateSeatSelection({
                draft: this._completeDraft(['B-1', 'B-2']),
                auditorium: fixture.auditorium,
                inventory
            });
            this.assertTrue(result.ok);
        });

        this.test('无障碍与陪同席应要求确认且保持相邻规则', () => {
            const fixture = this._fixture();
            const inventory = createShowtimeInventory({
                showtimeId: fixture.showtime.id,
                updatedAt: NOW
            });
            const unacknowledged = validateSeatSelection({
                draft: this._completeDraft(['C-W1', 'C-1']),
                auditorium: fixture.auditorium,
                inventory,
                policy: { preventOrphanSeat: false }
            });
            this.assertEqual(unacknowledged.error.code, 'ACCESSIBLE_SEAT_ACKNOWLEDGEMENT_REQUIRED');

            const companionOnly = validateSeatSelection({
                draft: this._completeDraft(['C-1', 'C-2'], true),
                auditorium: fixture.auditorium,
                inventory,
                policy: { preventOrphanSeat: false }
            });
            this.assertEqual(companionOnly.error.code, 'COMPANION_REQUIRES_WHEELCHAIR_SPACE');

            const valid = validateSeatSelection({
                draft: this._completeDraft(['C-W1', 'C-1'], true),
                auditorium: fixture.auditorium,
                inventory,
                policy: { preventOrphanSeat: false }
            });
            this.assertTrue(valid.ok);
        });

        this.test('库存 reserve 应原子占用整组座位并拒绝第二个 hold', () => {
            const fixture = this._fixture();
            const inventory = createShowtimeInventory({
                showtimeId: fixture.showtime.id,
                updatedAt: NOW
            });
            const reserved = reserveSeats(inventory, {
                holdId: 'hold-1',
                seatIds: ['A-2', 'A-3'],
                updatedAt: NOW
            });
            this.assertTrue(reserved.ok);
            this.assertEqual(reserved.value.holdIdsBySeatId['A-2'], 'hold-1');
            this.assertEqual(reserved.value.revision, 1);
            const conflict = reserveSeats(reserved.value, {
                holdId: 'hold-2',
                seatIds: ['A-3', 'A-4'],
                updatedAt: NOW
            });
            this.assertEqual(conflict.error.code, 'SEAT_UNAVAILABLE');
            this.assertFalse(Boolean(reserved.value.holdIdsBySeatId['A-4']));
        });

        this.test('placeBookingHold 应创建 held 状态、quote 和库存映射', () => {
            const fixture = this._fixture();
            const result = this._placeHold(fixture);
            this.assertTrue(result.ok);
            this.assertEqual(result.value.hold.status, 'held');
            this.assertEqual(result.value.hold.expiresAt, '2026-07-18T10:10:00.000Z');
            this.assertEqual(result.value.hold.pricingQuote.total.amount, 12100);
            this.assertEqual(result.value.inventory.holdIdsBySeatId['A-2'], 'hold-1');
        });

        this.test('held 状态应可 release 或 expire 并释放库存', () => {
            const fixture = this._fixture();
            const placed = this._placeHold(fixture).value;
            const released = releaseBookingHold(placed, {
                releasedAt: '2026-07-18T10:05:00.000Z',
                reason: 'change-seats'
            });
            this.assertTrue(released.ok);
            this.assertEqual(released.value.hold.status, 'released');
            this.assertEqual(Object.keys(released.value.inventory.holdIdsBySeatId).length, 0);

            const placedAgain = this._placeHold(fixture).value;
            const expired = expireBookingHold(placedAgain, LATER);
            this.assertTrue(expired.ok);
            this.assertEqual(expired.value.hold.status, 'expired');
            this.assertEqual(Object.keys(expired.value.inventory.holdIdsBySeatId).length, 0);
        });

        this.test('consume 应把 hold 座位原子转为 sold 并可生成订单快照', () => {
            const fixture = this._fixture();
            const placed = this._placeHold(fixture).value;
            const consumed = consumeBookingHold(placed, {
                orderId: 'order-1',
                consumedAt: '2026-07-18T10:04:00.000Z'
            });
            this.assertTrue(consumed.ok);
            this.assertEqual(consumed.value.hold.status, 'consumed');
            this.assertEqual(consumed.value.inventory.soldSeatIds.length, 2);
            this.assertEqual(Object.keys(consumed.value.inventory.holdIdsBySeatId).length, 0);

            const order = createCommercialOrder({
                id: 'order-1',
                idempotencyKey: consumed.value.hold.idempotencyKey,
                userId: 'user-1',
                hold: consumed.value.hold,
                movie: fixture.movie,
                cinema: fixture.cinema,
                auditorium: fixture.auditorium,
                showtime: fixture.showtime,
                refundPolicy: fixture.refundPolicy,
                ticketCode: 'SC202607180001',
                qrPayload: 'smartcinema:ticket:order-1',
                confirmedAt: '2026-07-18T10:04:00.000Z'
            });
            this.assertEqual(order.movieSnapshot.title, '星际回响');
            this.assertEqual(order.showtimeSnapshot.startsAt, fixture.showtime.startsAt);
            this.assertEqual(order.seatSnapshots[0].label, 'A排2座');
            this.assertEqual(order.pricingQuote.total.amount, 12100);
        });

        this.test('退票资格应使用订单政策快照计算截止时间、手续费与退款额', () => {
            const booking = this._confirmedBooking();
            const eligible = getCommercialCancellationEligibility(booking.order, NOW);
            this.assertTrue(eligible.eligible);
            this.assertEqual(eligible.cutoffAt, '2026-07-18T10:30:00.000Z');
            this.assertEqual(eligible.fee.amount, 500);
            this.assertEqual(eligible.refundAmount.amount, 11600);

            const late = getCommercialCancellationEligibility(
                booking.order,
                '2026-07-18T10:31:00.000Z'
            );
            this.assertFalse(late.eligible);
            this.assertEqual(late.code, 'CUTOFF_PASSED');
        });

        this.test('取消商业订单应同时发起退款并释放整组已售座位', () => {
            const booking = this._confirmedBooking();
            const cancelled = cancelCommercialBooking(booking, {
                cancelledAt: NOW,
                reason: 'customer-requested'
            });
            this.assertTrue(cancelled.ok, cancelled.error?.message);
            this.assertEqual(cancelled.value.order.status, 'cancelled');
            this.assertEqual(cancelled.value.order.refund.status, 'pending');
            this.assertEqual(cancelled.value.order.refund.amount.amount, 11600);
            this.assertEqual(cancelled.value.inventory.soldSeatIds.length, 0);
            this.assertEqual(booking.order.status, 'confirmed');
            this.assertEqual(booking.inventory.soldSeatIds.length, 2);
        });

        this.test('超过退票截止时间不得改变订单或已售库存', () => {
            const booking = this._confirmedBooking();
            const cancelled = cancelCommercialBooking(booking, {
                cancelledAt: '2026-07-18T10:31:00.000Z',
                reason: 'customer-requested'
            });
            this.assertFalse(cancelled.ok);
            this.assertEqual(cancelled.error.code, 'REFUND_NOT_ELIGIBLE');
            this.assertEqual(booking.order.status, 'confirmed');
            this.assertEqual(booking.inventory.soldSeatIds.length, 2);
        });

        this.test('DemoCatalog 应提供多电影、多影院、多营业日与完整场次引用', () => {
            const catalog = createDemoCatalog('2026-07-18');
            const repository = new DemoCatalogRepository(catalog);
            const showtimes = repository.listShowtimes({ businessDate: '2026-07-18' });
            this.assertEqual(repository.listMovies().length, 7);
            repository.listMovies().forEach(movie => {
                this.assertTrue(
                    movie.posterUrl.startsWith('./public/images/posters/'),
                    `${movie.title} 缺少项目本地封面`
                );
            });
            this.assertEqual(repository.listCinemas().length, 3);
            this.assertEqual(repository.listBusinessDates().length, 3);
            this.assertEqual(repository.listShowtimes().length, 108);
            this.assertEqual(showtimes.length, 36);
            this.assertTrue(repository.listShowtimes({
                movieId: 'movie-zootopia',
                cinemaId: 'cinema-riverside',
                businessDate: '2026-07-19'
            }).length > 0);
            repository.listBusinessDates().forEach(date => {
                repository.listMovies().forEach(movie => {
                    this.assertTrue(
                        repository.listShowtimes({ movieId: movie.id, businessDate: date }).length >= 4,
                        `${date} 的 ${movie.title} 少于 4 场`
                    );
                });
            });
            const auditoriums = Object.values(catalog.auditoriums);
            this.assertEqual(
                auditoriums.map(auditorium => auditorium.seats.length).sort((left, right) => left - right).join(','),
                '100,100,200,200,300,300'
            );
            auditoriums.forEach(auditorium => {
                this.assertEqual(auditorium.seats.filter(seat => seat.kind === 'wheelchair').length, 2);
                this.assertEqual(auditorium.seats.filter(seat => seat.kind === 'companion').length, 2);
            });
            this.assertEqual(repository.listTicketTypes().length, 4);
            showtimes.forEach(showtime => {
                this.assertTrue(Boolean(repository.getMovie(showtime.movieId)));
                this.assertTrue(Boolean(repository.getCinema(showtime.cinemaId)));
                this.assertTrue(Boolean(repository.getAuditorium(showtime.auditoriumId)));
                this.assertTrue(Boolean(repository.getPricingPolicy(showtime.pricingPolicyId)));
                this.assertTrue(Boolean(repository.getRefundPolicy(showtime.refundPolicyId)));
            });

            const shiftedRepository = new DemoCatalogRepository(createDemoCatalog('2026-07-19'));
            const normalizedSchedule = items => items.map(showtime => ({
                movieId: showtime.movieId,
                cinemaId: showtime.cinemaId,
                auditoriumId: showtime.auditoriumId,
                time: showtime.startsAt.slice(11, 16),
                format: showtime.format,
                pricingPolicyId: showtime.pricingPolicyId
            }));
            this.assertEqual(
                JSON.stringify(normalizedSchedule(repository.listShowtimes({ businessDate: '2026-07-18' }))),
                JSON.stringify(normalizedSchedule(shiftedRepository.listShowtimes({ businessDate: '2026-07-21' }))),
                '新增营业日没有复用刚结束营业日的排期模板'
            );
        });

        return this.printSummary();
    }

    _draft() {
        return createBookingDraft({
            showtimeId: 'showtime-1',
            ticketItems: [
                { ticketTypeId: 'adult', quantity: 1 },
                { ticketTypeId: 'child', quantity: 1 }
            ],
            selectedSeatIds: [],
            preferences: ['center'],
            accessibilityAcknowledged: false,
            updatedAt: NOW
        });
    }

    _completeDraft(seatIds, accessibilityAcknowledged = false) {
        return createBookingDraft({
            ...this._draft(),
            selectedSeatIds: seatIds,
            accessibilityAcknowledged
        });
    }

    _placeHold(fixture) {
        return placeBookingHold({
            draft: this._completeDraft(['A-2', 'A-3']),
            ownerId: 'user-1',
            holdId: 'hold-1',
            idempotencyKey: 'hold-request-1',
            now: NOW,
            holdDurationSeconds: 600,
            auditorium: fixture.auditorium,
            inventory: createShowtimeInventory({
                showtimeId: fixture.showtime.id,
                updatedAt: NOW
            }),
            ticketTypesById: fixture.ticketTypesById,
            pricingPolicy: fixture.pricingPolicy
        });
    }

    _confirmedBooking() {
        const fixture = this._fixture();
        const consumed = consumeBookingHold(this._placeHold(fixture).value, {
            orderId: 'order-cancel-1',
            consumedAt: '2026-07-18T10:04:00.000Z'
        }).value;
        const order = createCommercialOrder({
            id: 'order-cancel-1',
            idempotencyKey: consumed.hold.idempotencyKey,
            userId: 'user-1',
            hold: consumed.hold,
            movie: fixture.movie,
            cinema: fixture.cinema,
            auditorium: fixture.auditorium,
            showtime: fixture.showtime,
            refundPolicy: fixture.refundPolicy,
            ticketCode: 'SC202607180002',
            qrPayload: 'smartcinema:ticket:order-cancel-1',
            confirmedAt: '2026-07-18T10:04:00.000Z'
        });
        return { order, inventory: consumed.inventory };
    }

    _fixture() {
        const movie = createMovie({
            id: 'movie-1',
            title: '星际回响',
            originalTitle: 'Echoes Beyond',
            durationMinutes: 128,
            audienceRating: '12+',
            genres: ['科幻', '剧情']
        });
        const cinema = createCinema({
            id: 'cinema-1',
            name: 'SmartCinema 光影中心',
            city: '上海',
            address: '示范路 88 号',
            serviceFeatures: ['step-free-access', 'mobile-ticket']
        });
        const auditorium = createAuditorium({
            id: 'auditorium-1',
            cinemaId: cinema.id,
            name: '1 号 IMAX 厅',
            seats: [
                this._seat('A-1', 0, 0, 'A', 1, 'left', 'standard'),
                this._seat('A-2', 0, 1, 'A', 2, 'left', 'preferred'),
                this._seat('A-3', 0, 2, 'A', 3, 'left', 'standard'),
                this._seat('A-4', 0, 3, 'A', 4, 'left', 'standard'),
                this._seat('A-5', 0, 4, 'A', 5, 'left', 'standard'),
                this._seat('B-1', 1, 0, 'B', 1, 'right', 'standard'),
                this._seat('B-2', 1, 1, 'B', 2, 'right', 'standard'),
                this._seat('C-W1', 2, 0, 'C', 1, 'accessible', 'standard', 'wheelchair'),
                this._seat('C-1', 2, 1, 'C', 2, 'accessible', 'standard', 'companion', 'C-W1'),
                this._seat('C-2', 2, 2, 'C', 3, 'accessible', 'standard', 'companion', 'C-W1')
            ],
            accessibilityFeatures: ['wheelchair-spaces', 'step-free-access']
        });
        const showtime = createShowtime({
            id: 'showtime-1',
            movieId: movie.id,
            cinemaId: cinema.id,
            auditoriumId: auditorium.id,
            startsAt: '2026-07-18T19:30:00.000+08:00',
            endsAt: '2026-07-18T21:38:00.000+08:00',
            format: 'IMAX-2D',
            language: '英语',
            subtitle: '中文字幕',
            accessibilityFeatures: ['wheelchair-spaces'],
            salesState: 'on-sale',
            pricingPolicyId: 'pricing-1',
            refundPolicyId: 'refund-1',
            bookingClosesAt: '2026-07-18T19:20:00.000+08:00'
        });
        const ticketTypesById = {
            adult: createTicketType({
                id: 'adult',
                label: '成人票',
                description: '标准票',
                priceAdjustment: 0
            }),
            child: createTicketType({
                id: 'child',
                label: '儿童票',
                description: '需现场核验年龄',
                eligibilityNote: '适用于 12 周岁以下儿童',
                priceAdjustment: -1500
            })
        };
        const pricingPolicy = createPricingPolicy({
            id: 'pricing-1',
            currency: 'CNY',
            baseTicketPrice: 6000,
            serviceFeePerTicket: 300,
            seatZoneSurcharges: {
                standard: 0,
                preferred: 1000
            }
        });
        const refundPolicy = createRefundPolicy({
            id: 'refund-1',
            refundable: true,
            cutoffMinutesBeforeShowtime: 60,
            feeAmount: 500,
            currency: 'CNY',
            summary: '开场前 60 分钟可退，收取每单 5 元服务费'
        });
        return {
            movie,
            cinema,
            auditorium,
            showtime,
            ticketTypesById,
            pricingPolicy,
            refundPolicy
        };
    }

    _seat(id, rowIndex, columnIndex, rowLabel, seatNumber, sectionId, zoneId, kind = 'standard', companionForSeatId = null) {
        return {
            id,
            rowIndex,
            columnIndex,
            rowLabel,
            seatNumber,
            label: `${rowLabel}排${seatNumber}座`,
            sectionId,
            zoneId,
            kind,
            companionForSeatId,
            stepFree: kind === 'wheelchair' || kind === 'companion'
        };
    }

    printSummary() {
        const total = this.passed + this.failed;
        const rate = ((this.passed / total) * 100).toFixed(1);
        console.log('\n========== 测试摘要 ==========');
        console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 成功率: ${rate}%\n`);
        return { passed: this.passed, failed: this.failed, total };
    }
}

export default TestCommercialDomain;
