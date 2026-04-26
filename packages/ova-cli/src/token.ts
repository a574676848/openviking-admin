export function decodeJwtExp(token?: string) {
    if (!token) {
        return undefined;
    }

    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) {
        return undefined;
    }

    try {
        const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
        const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: number };
        return payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined;
    } catch {
        return undefined;
    }
}

export function isExpired(isoTime?: string, skewSeconds = 30) {
    if (!isoTime) {
        return false;
    }

    return Date.now() + skewSeconds * 1000 >= new Date(isoTime).getTime();
}
