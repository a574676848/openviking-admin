import { callApi } from '../api';
import type { CredentialStore } from '../state-store';
import { readProfile } from '../state-store';
import { isExpired } from '../token';
import { emitOutput, resolveOutputMode } from '../output';

const CHECK_LABELS: Record<string, string> = {
    'profile.state': '本地凭证状态',
    'profile.jwt': 'access token',
    'profile.refresh': 'refresh token',
    capabilities: 'capability catalog 连通性',
    'auth.whoami': '当前登录态校验',
};

function describeCheck(check: Record<string, unknown>) {
    const name = String(check.name);
    const ok = Boolean(check.ok);
    const label = CHECK_LABELS[name] ?? name;
    const parts = [`${ok ? '[通过]' : '[失败]'} ${label}`];

    if (check.statusCode) {
        parts.push(`HTTP=${String(check.statusCode)}`);
    }

    if (check.expiresAt) {
        parts.push(`expiresAt=${String(check.expiresAt)}`);
    }

    if (check.expired !== null && check.expired !== undefined) {
        parts.push(`expired=${String(check.expired)}`);
    }

    if (check.error) {
        parts.push(`原因=${String(check.error)}`);
    }

    if (!ok) {
        if (name === 'profile.jwt' || name === 'profile.refresh') {
            parts.push('建议=执行 ova auth login 或 ova auth token-exchange 刷新登录态');
        } else if (name === 'capabilities') {
            parts.push('建议=确认服务已启动，并检查 profile 对应的 serverUrl 是否可访问');
        } else if (name === 'auth.whoami') {
            parts.push('建议=确认当前 access token、租户上下文和账号权限仍有效');
        }
    }

    return parts.join(' | ');
}

export async function handleDoctor(
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    const { profileName, profile } = readProfile(store, options);
    const checks: Array<Record<string, unknown>> = [];

    checks.push({
        name: 'profile.state',
        ok: true,
        hasAccessToken: Boolean(profile.accessToken),
        hasRefreshToken: Boolean(profile.refreshToken),
        hasCapabilityAccessToken: Boolean(profile.capabilityAccessToken),
        hasSessionKey: Boolean(profile.sessionKey),
        hasApiKey: Boolean(profile.apiKey),
    });

    checks.push({
        name: 'profile.jwt',
        ok: Boolean(profile.accessToken),
        expiresAt: profile.accessTokenExpiresAt ?? null,
        expired: profile.accessToken ? isExpired(profile.accessTokenExpiresAt, 0) : null,
    });

    checks.push({
        name: 'profile.refresh',
        ok: Boolean(profile.refreshToken),
        expiresAt: profile.refreshTokenExpiresAt ?? null,
        expired: profile.refreshToken ? isExpired(profile.refreshTokenExpiresAt, 0) : null,
    });

    try {
        const response = await fetch(`${profile.serverUrl}/api/v1/capabilities`);
        checks.push({
            name: 'capabilities',
            ok: response.ok,
            statusCode: response.status,
        });
    } catch (error) {
        checks.push({
            name: 'capabilities',
            ok: false,
            error: error instanceof Error ? error.message : '未知错误',
        });
    }

    if (profile.accessToken || profile.refreshToken) {
        try {
            const whoami = await callApi('/api/v1/auth/whoami', {}, options, store);
            checks.push({
                name: 'auth.whoami',
                ok: true,
                userId: (whoami.data as Record<string, unknown>).userId,
                tenantId: (whoami.data as Record<string, unknown>).tenantId,
            });
        } catch (error) {
            checks.push({
                name: 'auth.whoami',
                ok: false,
                error: error instanceof Error ? error.message : '未知错误',
            });
        }
    }

    const payload = {
        profile: profileName,
        serverUrl: profile.serverUrl,
        statePath: store.getStatePath(),
        checks,
    };

    emitOutput(
        output,
        payload,
        () =>
            [
                `profile: ${profileName}`,
                `serverUrl: ${profile.serverUrl}`,
                `statePath: ${store.getStatePath()}`,
                '诊断结果:',
                ...checks.map((check) => describeCheck(check)),
            ].join('\n'),
        checks.map((check) => ({
            profile: profileName,
            serverUrl: profile.serverUrl,
            ...check,
        })),
    );
}
