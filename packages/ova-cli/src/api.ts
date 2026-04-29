import {
    CliProfile,
    CliStateFile,
    CredentialStore,
    readProfile,
    saveProfile,
} from './state-store';
import { decodeJwtExp, isExpired } from './token';

export function unwrapError(payload: Record<string, unknown>, statusCode: number) {
    const error = payload.error as Record<string, unknown> | undefined;
    const message = String(error?.message ?? payload.message ?? payload.error ?? `HTTP ${statusCode}`);

    if (statusCode === 401) {
        return `${message}。请先执行 ova auth login，或确认 refresh token 仍有效。`;
    }

    if (statusCode === 403) {
        return `${message}。请检查当前租户上下文与 minimumRole 是否满足要求。`;
    }

    return message;
}

export function formatRuntimeError(error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (message.includes('fetch failed')) {
        return '无法连接目标服务。请确认服务已启动、网络可达，且当前 profile 的 serverUrl 配置正确。';
    }

    return message;
}

export async function refreshAccessToken(
    profileName: string,
    profile: CliProfile,
    stateFile: CliStateFile,
    store: CredentialStore,
) {
    if (!profile.refreshToken || isExpired(profile.refreshTokenExpiresAt, 0)) {
        return null;
    }

    const response = await fetch(`${profile.serverUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            refreshToken: profile.refreshToken,
        }),
    });

    const payload = (await response.json()) as {
        accessToken?: string;
        refreshToken?: string;
        message?: string;
    };

    if (!response.ok || !payload.accessToken || !payload.refreshToken) {
        throw new Error(payload.message ?? '刷新登录态失败');
    }

    const nextProfile: CliProfile = {
        ...profile,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        accessTokenExpiresAt: decodeJwtExp(payload.accessToken),
        refreshTokenExpiresAt: decodeJwtExp(payload.refreshToken),
    };
    saveProfile(store, profileName, nextProfile, stateFile);
    return nextProfile;
}

export async function ensureAccessToken(
    profileName: string,
    profile: CliProfile,
    stateFile: CliStateFile,
    store: CredentialStore,
) {
    if (profile.accessToken && !isExpired(profile.accessTokenExpiresAt)) {
        return profile;
    }

    const refreshed = await refreshAccessToken(profileName, profile, stateFile, store);
    if (refreshed) {
        return refreshed;
    }

    return profile;
}

export async function callApi(
    path: string,
    init: RequestInit = {},
    options: Record<string, string | boolean> = {},
    store: CredentialStore,
) {
    const { stateFile, profileName, profile } = readProfile(store, options);
    const nextProfile = await ensureAccessToken(profileName, profile, stateFile, store);
    const headers = new Headers(init.headers ?? {});
    applyProfileCredential(headers, nextProfile);
    if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${nextProfile.serverUrl}${path}`, {
        ...init,
        headers,
    });

    if (response.status === 401 && nextProfile.refreshToken) {
        const refreshedProfile = await refreshAccessToken(profileName, nextProfile, stateFile, store);
        if (refreshedProfile?.accessToken) {
            const retryHeaders = new Headers(init.headers ?? {});
            applyProfileCredential(retryHeaders, refreshedProfile);
            if (!retryHeaders.has('Content-Type') && init.body) {
                retryHeaders.set('Content-Type', 'application/json');
            }

            const retryResponse = await fetch(`${refreshedProfile.serverUrl}${path}`, {
                ...init,
                headers: retryHeaders,
            });
            const retryPayload = (await retryResponse.json()) as Record<string, unknown>;
            if (!retryResponse.ok) {
                throw new Error(unwrapError(retryPayload, retryResponse.status));
            }
            return retryPayload;
        }
    }

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
        throw new Error(unwrapError(payload, response.status));
    }

    return payload;
}

function applyProfileCredential(headers: Headers, nextProfile: CliProfile) {
    if (headers.has('Authorization') || headers.has('x-capability-key')) {
        return;
    }

    if (nextProfile.accessToken && !isExpired(nextProfile.accessTokenExpiresAt)) {
        headers.set('Authorization', `Bearer ${nextProfile.accessToken}`);
        return;
    }

    if (nextProfile.capabilityAccessToken && !isExpired(nextProfile.capabilityAccessTokenExpiresAt)) {
        headers.set('Authorization', `Bearer ${nextProfile.capabilityAccessToken}`);
        return;
    }

    if (nextProfile.sessionKey && !isExpired(nextProfile.sessionKeyExpiresAt)) {
        headers.set('Authorization', `Bearer ${nextProfile.sessionKey}`);
        return;
    }

    if (nextProfile.apiKey) {
        headers.set('x-capability-key', nextProfile.apiKey);
    }
}
