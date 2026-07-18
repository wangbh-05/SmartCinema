import { addMilliseconds } from '../../shared/time.js';
import { err, ok } from '../../shared/Result.js';
import { quoteBooking } from './PricingQuote.js';
import { validateSeatSelection } from './SeatSelectionPolicy.js';
import {
    consumeHeldSeats,
    releaseHeldSeats,
    reserveSeats
} from './ShowtimeInventory.js';
import {
    consumeSeatHoldState,
    createPendingSeatHold,
    expireSeatHoldState,
    markSeatHoldHeld,
    releaseSeatHold
} from './SeatHold.js';

export function placeBookingHold({
    draft,
    ownerId,
    holdId,
    idempotencyKey,
    now,
    holdDurationSeconds,
    auditorium,
    inventory,
    ticketTypesById,
    pricingPolicy,
    selectionPolicy = {}
}) {
    if (!Number.isInteger(holdDurationSeconds) || holdDurationSeconds <= 0) {
        return err('VALIDATION_ERROR', 'holdDurationSeconds 必须是正整数');
    }
    const selection = validateSeatSelection({
        draft,
        auditorium,
        inventory,
        policy: selectionPolicy
    });
    if (!selection.ok) return selection;

    const quote = quoteBooking({
        draft,
        auditorium,
        ticketTypesById,
        pricingPolicy,
        quotedAt: now
    });
    if (!quote.ok) return quote;

    let pending;
    try {
        pending = createPendingSeatHold({
            id: holdId,
            idempotencyKey,
            ownerId,
            showtimeId: draft.showtimeId,
            ticketItems: draft.ticketItems,
            seatIds: draft.selectedSeatIds,
            requestedAt: now,
            expectedInventoryRevision: inventory.revision
        });
    } catch (error) {
        return err('VALIDATION_ERROR', error.message, error.details || {});
    }

    const reserved = reserveSeats(inventory, {
        holdId: pending.id,
        seatIds: pending.seatIds,
        updatedAt: now
    });
    if (!reserved.ok) return reserved;

    const held = markSeatHoldHeld(pending, {
        heldAt: now,
        expiresAt: addMilliseconds(now, holdDurationSeconds * 1000),
        inventoryRevision: reserved.value.revision,
        pricingQuote: quote.value
    });
    if (!held.ok) return held;

    return ok(Object.freeze({
        hold: held.value,
        inventory: reserved.value
    }));
}

export function releaseBookingHold({ hold, inventory }, { releasedAt, reason }) {
    const nextHold = releaseSeatHold(hold, { releasedAt, reason });
    if (!nextHold.ok) return nextHold;
    const nextInventory = releaseHeldSeats(inventory, hold.id, releasedAt);
    if (!nextInventory.ok) return nextInventory;
    return ok(Object.freeze({ hold: nextHold.value, inventory: nextInventory.value }));
}

export function expireBookingHold({ hold, inventory }, expiredAt) {
    const nextHold = expireSeatHoldState(hold, expiredAt);
    if (!nextHold.ok) return nextHold;
    const nextInventory = releaseHeldSeats(inventory, hold.id, expiredAt);
    if (!nextInventory.ok) return nextInventory;
    return ok(Object.freeze({ hold: nextHold.value, inventory: nextInventory.value }));
}

export function consumeBookingHold({ hold, inventory }, { orderId, consumedAt }) {
    const nextHold = consumeSeatHoldState(hold, { orderId, consumedAt });
    if (!nextHold.ok) return nextHold;
    const nextInventory = consumeHeldSeats(inventory, {
        holdId: hold.id,
        seatIds: hold.seatIds,
        updatedAt: consumedAt
    });
    if (!nextInventory.ok) return nextInventory;
    return ok(Object.freeze({ hold: nextHold.value, inventory: nextInventory.value }));
}
