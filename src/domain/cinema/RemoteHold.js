import { ValidationError } from '../../shared/ValidationError.js';
import { parseSeatKey } from './Seat.js';
import { parseShowtimeId } from './Showtime.js';

export function createRemoteHold({ id, showtimeId, seatKey, ownerLabel, expiresAt }) {
    if (typeof id !== 'string' || id.length === 0) {
        throw new ValidationError('RemoteHold id 不能为空');
    }
    const showtime = parseShowtimeId(showtimeId);
    parseSeatKey(seatKey, showtime.hallType);
    if (typeof ownerLabel !== 'string' || ownerLabel.trim().length === 0) {
        throw new ValidationError('RemoteHold ownerLabel 不能为空');
    }
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
        throw new ValidationError('RemoteHold expiresAt 必须是 ISO 时间字符串');
    }

    return Object.freeze({ id, showtimeId, seatKey, ownerLabel: ownerLabel.trim(), expiresAt });
}

export function addRemoteHold(remoteHoldsBySeatKey, hold, now) {
    const next = removeExpiredRemoteHolds(remoteHoldsBySeatKey, now);
    if (Date.parse(hold.expiresAt) <= Date.parse(now)) return next;
    next.set(hold.seatKey, hold);
    return next;
}

export function removeRemoteHold(remoteHoldsBySeatKey, seatKey) {
    const next = new Map(remoteHoldsBySeatKey);
    next.delete(seatKey);
    return next;
}

export function removeExpiredRemoteHolds(remoteHoldsBySeatKey, now) {
    if (typeof now !== 'string' || Number.isNaN(Date.parse(now))) {
        throw new ValidationError('清理 RemoteHold 需要合法 ISO 时间');
    }
    const timestamp = Date.parse(now);
    const next = new Map();
    remoteHoldsBySeatKey.forEach((hold, seatKey) => {
        if (Date.parse(hold.expiresAt) > timestamp) next.set(seatKey, hold);
    });
    return next;
}
