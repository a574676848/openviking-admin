import {
    CliProfile,
    CliStateFile,
    CredentialStore,
    persistIssuedCredential,
    readProfile,
    removeProfileCredentials,
    saveProfile,
} from '../state-store';
import { callApi } from '../api';
import { decodeJwtExp } from '../token';
import { emitOutput, resolveOutputMode } from '../output';

export async function handleAuth(
    command: string,
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    const { stateFile, profileName, profile } = readProfile(store, options);

    if (command === 'login') {
        const serverUrl = String(options.server ?? profile.serverUrl);
        const response = await fetch(`${serverUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: options.username,
                password: options.password,
                tenantCode: options['tenant-code'],
            }),
        });

        const payload = (await response.json()) as Record<string, unknown>;
        const data = (payload.data ?? payload) as Record<string, unknown>;
        const accessToken = String(data.accessToken ?? '');
        const refreshToken = String(data.refreshToken ?? '');
        if (!response.ok || !accessToken || !refreshToken) {
            throw new Error(String(payload.message ?? payload.error ?? '登录失败'));
        }

        saveProfile(
            store,
            profileName,
            {
                serverUrl,
                accessToken,
                refreshToken,
                accessTokenExpiresAt: decodeJwtExp(accessToken),
                refreshTokenExpiresAt: decodeJwtExp(refreshToken),
            },
            stateFile,
        );

        const result = {
            profile: profileName,
            serverUrl,
            user: data.user,
            expiresInSeconds: data.expiresInSeconds,
            refreshExpiresInSeconds: data.refreshExpiresInSeconds,
        };

        emitOutput(output, result, () => `登录成功，profile=${profileName}，server=${serverUrl}`, [result]);
        return;
    }

    if (command === 'sso') {
        const response = await callApi(
            '/api/v1/auth/sso/exchange',
            {
                method: 'POST',
                body: JSON.stringify({
                    ticket: options.ticket,
                }),
                headers: { 'Content-Type': 'application/json' },
            },
            options,
            store,
        );
        const data = (response.data ?? response) as Record<string, unknown>;
        const accessToken = String(data.accessToken ?? '');
        const refreshToken = String(data.refreshToken ?? '');
        saveProfile(
            store,
            profileName,
            {
                ...profile,
                accessToken,
                refreshToken,
                accessTokenExpiresAt: decodeJwtExp(accessToken),
                refreshTokenExpiresAt: decodeJwtExp(refreshToken),
            },
            stateFile,
        );

        emitOutput(output, response, () => `SSO ticket 换证成功，profile=${profileName}`, [
            {
                profile: profileName,
                flow: 'auth.sso',
                ok: true,
            },
        ]);
        return;
    }

    if (command === 'whoami') {
        const response = await callApi('/api/v1/auth/whoami', {}, options, store);
        const data = response.data as Record<string, unknown>;
        emitOutput(
            output,
            response,
            () =>
                [
                    `profile: ${profileName}`,
                    `userId: ${String(data.userId ?? '')}`,
                    `username: ${String(data.username ?? '')}`,
                    `tenantId: ${String(data.tenantId ?? '')}`,
                    `role: ${String(data.role ?? '')}`,
                ].join('\n'),
            [
                {
                    profile: profileName,
                    ...data,
                    traceId: response.traceId,
                },
            ],
        );
        return;
    }

    if (command === 'status') {
        const payload = buildStatusPayload(profileName, profile, stateFile);
        emitOutput(
            output,
            payload,
            () =>
                [
                    `profile: ${payload.profile}`,
                    `serverUrl: ${payload.serverUrl}`,
                    `authenticated: ${payload.authenticated ? 'yes' : 'no'}`,
                    `accessTokenExpiresAt: ${payload.accessTokenExpiresAt ?? '-'}`,
                    `refreshTokenExpiresAt: ${payload.refreshTokenExpiresAt ?? '-'}`,
                    `capabilityAccessTokenExpiresAt: ${payload.capabilityAccessTokenExpiresAt ?? '-'}`,
                    `sessionKeyExpiresAt: ${payload.sessionKeyExpiresAt ?? '-'}`,
                    `hasApiKey: ${payload.hasApiKey ? 'yes' : 'no'}`,
                ].join('\n'),
            [payload],
        );
        return;
    }

    if (command === 'credential-options') {
        const response = await callApi('/api/v1/auth/credential-options', {}, options, store);
        const data = response.data as Record<string, unknown>;
        const capabilities = (data.capabilities ?? []) as Array<Record<string, unknown>>;
        emitOutput(
            output,
            response,
            () =>
                [
                    `profile: ${profileName}`,
                    `browser login: ${String(((data.login as Record<string, unknown>)?.browser as Record<string, unknown>)?.exchangeEndpoint ?? '-')}`,
                    ...capabilities.map(
                        (item) =>
                            `${String(item.channel)} -> ${String(item.credentialType)} @ ${String(item.issueEndpoint)} ttl=${String(
                                item.ttlSeconds ?? '-',
                            )}`,
                    ),
                ].join('\n'),
            capabilities.map((item) => ({
                profile: profileName,
                ...item,
            })),
        );
        return;
    }

    if (command === 'token-exchange') {
        const response = await callApi('/api/v1/auth/token/exchange', { method: 'POST' }, options, store);
        const data = response.data as Record<string, unknown>;
        const accessToken = String(data.accessToken ?? '');
        const expiresInSeconds = Number(data.expiresInSeconds ?? 0);
        const expiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : undefined;
        if (options.save === true || options.save === 'true') {
            persistIssuedCredential(store, profileName, profile, stateFile, {
                type: 'capability_access_token',
                value: accessToken,
                expiresAt,
            });
        }
        const payload = {
            profile: profileName,
            save: options.save === true || options.save === 'true',
            ...data,
            expiresAt,
            traceId: response.traceId,
        };
        emitOutput(
            output,
            payload,
            () =>
                [
                    `profile: ${profileName}`,
                    `credentialType: ${String(data.credentialType ?? '-')}`,
                    `expiresInSeconds: ${String(data.expiresInSeconds ?? '-')}`,
                    `expiresAt: ${expiresAt ?? '-'}`,
                    `traceId: ${String(response.traceId ?? '-')}`,
                    `saved: ${payload.save ? 'yes' : 'no'}`,
                    `accessToken: ${accessToken}`,
                ].join('\n'),
            [payload],
        );
        return;
    }

    if (command === 'session-exchange') {
        const response = await callApi('/api/v1/auth/session/exchange', { method: 'POST' }, options, store);
        const data = response.data as Record<string, unknown>;
        const sessionKey = String(data.sessionKey ?? '');
        const expiresInSeconds = Number(data.expiresInSeconds ?? 0);
        const expiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : undefined;
        if (options.save === true || options.save === 'true') {
            persistIssuedCredential(store, profileName, profile, stateFile, {
                type: 'session_key',
                value: sessionKey,
                expiresAt,
            });
        }
        const payload = {
            profile: profileName,
            save: options.save === true || options.save === 'true',
            ...data,
            expiresAt,
            traceId: response.traceId,
        };
        emitOutput(
            output,
            payload,
            () =>
                [
                    `profile: ${profileName}`,
                    `credentialType: ${String(data.credentialType ?? '-')}`,
                    `expiresInSeconds: ${String(data.expiresInSeconds ?? '-')}`,
                    `expiresAt: ${expiresAt ?? '-'}`,
                    `traceId: ${String(response.traceId ?? '-')}`,
                    `saved: ${payload.save ? 'yes' : 'no'}`,
                    `sessionKey: ${sessionKey}`,
                ].join('\n'),
            [payload],
        );
        return;
    }

    if (command === 'client-credentials') {
        const response = await callApi(
            '/api/v1/auth/client-credentials',
            {
                method: 'POST',
                body: JSON.stringify({
                    name: options.name,
                }),
            },
            options,
            store,
        );
        const data = response.data as Record<string, unknown>;
        const apiKey = String(data.apiKey ?? '');
        if (options.save === true || options.save === 'true') {
            persistIssuedCredential(store, profileName, profile, stateFile, {
                type: 'api_key',
                value: apiKey,
            });
        }
        const payload = {
            profile: profileName,
            save: options.save === true || options.save === 'true',
            ...data,
            traceId: response.traceId,
        };
        emitOutput(
            output,
            payload,
            () =>
                [
                    `profile: ${profileName}`,
                    `credentialType: ${String(data.credentialType ?? '-')}`,
                    `name: ${String(data.name ?? '-')}`,
                    `traceId: ${String(response.traceId ?? '-')}`,
                    `saved: ${payload.save ? 'yes' : 'no'}`,
                    `apiKey: ${apiKey}`,
                ].join('\n'),
            [payload],
        );
        return;
    }

    if (command === 'logout') {
        removeProfileCredentials(store, profileName, stateFile);
        const payload = { ok: true, profile: profileName };
        emitOutput(output, payload, () => `已清除本地登录态，profile=${profileName}`, [payload]);
        return;
    }

    throw new Error(`未知 auth 子命令: ${command}`);
}

function buildStatusPayload(profileName: string, profile: CliProfile, _stateFile: CliStateFile) {
    return {
        profile: profileName,
        serverUrl: profile.serverUrl,
        authenticated: Boolean(profile.accessToken),
        accessTokenExpiresAt: profile.accessTokenExpiresAt,
        refreshTokenExpiresAt: profile.refreshTokenExpiresAt,
        capabilityAccessTokenExpiresAt: profile.capabilityAccessTokenExpiresAt,
        sessionKeyExpiresAt: profile.sessionKeyExpiresAt,
        hasApiKey: Boolean(profile.apiKey),
    };
}
