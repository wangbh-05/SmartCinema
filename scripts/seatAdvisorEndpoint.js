import {
    interpretSeatPreferenceWithDeepSeek
} from '../src/infrastructure/ai/DeepSeekSeatPreferenceInterpreter.js';
import {
    interpretSeatPreferenceLocally
} from '../src/infrastructure/ai/RuleBasedSeatPreferenceInterpreter.js';

function sendJson(response, status, payload) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(payload));
}

function readJsonBody(request, limitBytes = 32768) {
    return new Promise((resolve, reject) => {
        let raw = '';
        request.setEncoding('utf8');
        request.on('data', chunk => {
            raw += chunk;
            if (Buffer.byteLength(raw, 'utf8') > limitBytes) {
                reject(new Error('REQUEST_TOO_LARGE'));
                request.destroy();
            }
        });
        request.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(new Error('INVALID_JSON'));
            }
        });
        request.on('error', reject);
    });
}

function sanitizeContext(input) {
    const context = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return Object.freeze({
        ticketCount: Number.isInteger(context.ticketCount) && context.ticketCount >= 1 &&
            context.ticketCount <= 20 ? context.ticketCount : 0,
        partyType: typeof context.partyType === 'string' ? context.partyType : null,
        preferences: Array.isArray(context.preferences) ? context.preferences
            .map(value => String(value || '').trim())
            .filter(Boolean)
            .slice(0, 4) : []
    });
}

export async function handleSeatAdvisorRequest(request, response) {
    let body;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        sendJson(response, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
            ok: false,
            error: error.message
        });
        return;
    }

    const preferenceText = typeof body.preferenceText === 'string' ? body.preferenceText.trim() : '';
    if (!preferenceText || preferenceText.length > 180) {
        sendJson(response, 400, { ok: false, error: 'PREFERENCE_INVALID' });
        return;
    }
    const context = sanitizeContext(body.context);
    if (!context.ticketCount) {
        sendJson(response, 400, { ok: false, error: 'CONTEXT_INVALID' });
        return;
    }

    try {
        const intent = await interpretSeatPreferenceWithDeepSeek({ preferenceText, context });
        if (intent) {
            sendJson(response, 200, { ok: true, source: 'deepseek', intent });
            return;
        }
    } catch (error) {
        console.warn(`[Seat Advisor] Provider unavailable: ${error.message}`);
    }

    sendJson(response, 200, {
        ok: true,
        source: 'fallback',
        intent: interpretSeatPreferenceLocally(preferenceText, context)
    });
}
