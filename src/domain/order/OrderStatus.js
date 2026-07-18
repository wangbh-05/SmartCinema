export const ORDER_STATUS = Object.freeze({
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled'
});

export function isOrderStatus(value) {
    return Object.values(ORDER_STATUS).includes(value);
}
