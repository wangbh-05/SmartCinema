import { ValidationError } from '../../shared/ValidationError.js';

function requireText(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} 不能为空`, { [fieldName]: value });
    }
    return value.trim();
}

function normalizeTextList(value, fieldName) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
        throw new ValidationError(`${fieldName} 必须是非空字符串数组`);
    }
    return Object.freeze([...new Set(value.map(item => item.trim()))]);
}

export function createCinema({ id, name, city, address, serviceFeatures = [] }) {
    return Object.freeze({
        id: requireText(id, 'Cinema.id'),
        name: requireText(name, 'Cinema.name'),
        city: requireText(city, 'Cinema.city'),
        address: requireText(address, 'Cinema.address'),
        serviceFeatures: normalizeTextList(serviceFeatures, 'Cinema.serviceFeatures')
    });
}
