#!/usr/bin/env node

import {
    CliProfile,
    CliStateFile,
    FileCredentialStore,
    getDefaultProfile,
    persistIssuedCredential,
    readProfile,
    removeProfileCredentials,
    saveProfile,
} from './state-store';

type OutputMode = 'text' | 'json' | 'jsonl';

interface ParsedArgs {
    group?: string;
    command?: string;
    options: Record<string, string | boolean>;
}

function parseOptions(argv: string[]): ParsedArgs {
    const [group, maybeCommand, ...restArgs] = argv;
    const command = maybeCommand?.startsWith('--') ? undefined : maybeCommand;
    const rest = command ? restArgs : ([maybeCommand, ...restArgs].filter(Boolean) as string[]);
    const options: Record<string, string | boolean> = {};

    for (let index = 0; index < rest.length; index += 1) {
        const current = rest[index];
        if (!current.startsWith('--')) {
            continue;
        }

        const key = current.replace(/^--/, '');
        const next = rest[index + 1];
        if (!next || next.startsWith('--')) {
            options[key] = true;
            continue;
        }

        options[key] = next;
        index += 1;
    }

    return {
        group,
        command,
        options,
    };
}

const credentialStore = new FileCredentialStore();

function decodeJwtExp(token?: string) {
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

function isExpired(isoTime?: string, skewSeconds = 30) {
    if (!isoTime) {
        return false;
    }

    return Date.now() + skewSeconds * 1000 >= new Date(isoTime).getTime();
}

async function refreshAccessToken(profileName: string, profile: CliProfile, stateFile: CliStateFile) {
    if (!profile.refreshToken || isExpired(profile.refreshTokenExpiresAt, 0)) {
        return null;
    }

    const response = await fetch(`${profile.serverUrl}/api/auth/refresh`, {
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
    saveProfile(credentialStore, profileName, nextProfile, stateFile);
    return nextProfile;
}

async function ensureAccessToken(profileName: string, profile: CliProfile, stateFile: CliStateFile) {
    if (profile.accessToken && !isExpired(profile.accessTokenExpiresAt)) {
        return profile;
    }

    const refreshed = await refreshAccessToken(profileName, profile, stateFile);
    if (refreshed) {
        return refreshed;
    }

    return profile;
}

function resolveOutputMode(options: Record<string, string | boolean>): OutputMode {
    if (options.output === 'json') {
        return 'json';
    }
    if (options.output === 'jsonl') {
        return 'jsonl';
    }
    return 'text';
}

function printJson(payload: unknown) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printJsonl(records: Array<Record<string, unknown>>) {
    process.stdout.write(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function printText(value: string) {
    process.stdout.write(`${value}\n`);
}

function emitOutput(mode: OutputMode, payload: unknown, renderText: () => string, jsonlRecords?: Array<Record<string, unknown>>) {
    if (mode === 'json') {
        printJson(payload);
        return;
    }

    if (mode === 'jsonl') {
        printJsonl(jsonlRecords ?? [{ data: payload as Record<string, unknown> }]);
        return;
    }

    printText(renderText());
}

function unwrapError(payload: Record<string, unknown>, statusCode: number) {
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

function formatRuntimeError(error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (message.includes('fetch failed')) {
        return `${message}。请确认服务已启动且当前 profile 的 serverUrl 可访问。`;
    }

    return message;
}

async function callApi(path: string, init: RequestInit = {}, options: Record<string, string | boolean> = {}) {
    const { stateFile, profileName, profile } = readProfile(credentialStore, options);
    const nextProfile = await ensureAccessToken(profileName, profile, stateFile);
    const headers = new Headers(init.headers ?? {});
    if (nextProfile.accessToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${nextProfile.accessToken}`);
    }
    if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${nextProfile.serverUrl}${path}`, {
        ...init,
        headers,
    });

    if (response.status === 401 && nextProfile.refreshToken) {
        const refreshedProfile = await refreshAccessToken(profileName, nextProfile, stateFile);
        if (refreshedProfile?.accessToken) {
            const retryHeaders = new Headers(init.headers ?? {});
            retryHeaders.set('Authorization', `Bearer ${refreshedProfile.accessToken}`);
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

async function handleAuth(command: string, options: Record<string, string | boolean>) {
    const output = resolveOutputMode(options);
    const { stateFile, profileName, profile } = readProfile(credentialStore, options);

    if (command === 'login') {
        const serverUrl = String(options.server ?? profile.serverUrl);
        const response = await fetch(`${serverUrl}/api/auth/login`, {
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
            throw new Error(unwrapError(payload, response.status));
        }

        saveProfile(
            credentialStore,
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
            '/api/auth/sso/exchange',
            {
                method: 'POST',
                body: JSON.stringify({
                    ticket: options.ticket,
                }),
                headers: { 'Content-Type': 'application/json' },
            },
            options,
        );
        const data = (response.data ?? response) as Record<string, unknown>;
        const accessToken = String(data.accessToken ?? '');
        const refreshToken = String(data.refreshToken ?? '');
        saveProfile(
            credentialStore,
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
        const response = await callApi('/api/auth/whoami', {}, options);
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
        const nextProfile = await ensureAccessToken(profileName, profile, stateFile);
        const payload = {
            profile: profileName,
            serverUrl: nextProfile.serverUrl,
            authenticated: Boolean(nextProfile.accessToken),
            accessTokenExpiresAt: nextProfile.accessTokenExpiresAt,
            refreshTokenExpiresAt: nextProfile.refreshTokenExpiresAt,
            capabilityAccessTokenExpiresAt: nextProfile.capabilityAccessTokenExpiresAt,
            sessionKeyExpiresAt: nextProfile.sessionKeyExpiresAt,
            hasApiKey: Boolean(nextProfile.apiKey),
        };

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
        const response = await callApi('/api/auth/credential-options', {}, options);
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
        const response = await callApi(
            '/api/auth/token/exchange',
            {
                method: 'POST',
            },
            options,
        );
        const data = response.data as Record<string, unknown>;
        const accessToken = String(data.accessToken ?? '');
        const expiresInSeconds = Number(data.expiresInSeconds ?? 0);
        const expiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : undefined;
        if (options.save === true || options.save === 'true') {
            persistIssuedCredential(credentialStore, profileName, profile, stateFile, {
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
        const response = await callApi(
            '/api/auth/session/exchange',
            {
                method: 'POST',
            },
            options,
        );
        const data = response.data as Record<string, unknown>;
        const sessionKey = String(data.sessionKey ?? '');
        const expiresInSeconds = Number(data.expiresInSeconds ?? 0);
        const expiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : undefined;
        if (options.save === true || options.save === 'true') {
            persistIssuedCredential(credentialStore, profileName, profile, stateFile, {
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
            '/api/auth/client-credentials',
            {
                method: 'POST',
                body: JSON.stringify({
                    name: options.name,
                }),
            },
            options,
        );
        const data = response.data as Record<string, unknown>;
        const apiKey = String(data.apiKey ?? '');
        if (options.save === true || options.save === 'true') {
            persistIssuedCredential(credentialStore, profileName, profile, stateFile, {
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
        removeProfileCredentials(credentialStore, profileName, stateFile);
        const payload = { ok: true, profile: profileName };
        emitOutput(output, payload, () => `已清除本地登录态，profile=${profileName}`, [payload]);
        return;
    }

    throw new Error(`未知 auth 子命令: ${command}`);
}

async function handleCapabilities(command: string, options: Record<string, string | boolean>) {
    const output = resolveOutputMode(options);
    const { profileName } = readProfile(credentialStore, options);
    const response = await callApi('/api/capabilities', {}, options);
    const items = response.data as Array<Record<string, unknown>>;

    if (command === 'list') {
        emitOutput(
            output,
            response,
            () =>
                items
                    .map(
                        (item) =>
                            `${String(item.id)}\n  ${String(item.description)}\n  HTTP: ${String(
                                (item.http as Record<string, unknown>).method,
                            )} ${String((item.http as Record<string, unknown>).path)}`,
                    )
                    .join('\n\n'),
            items.map((item) => ({
                profile: profileName,
                ...item,
            })),
        );
        return;
    }

    if (command === 'inspect') {
        const capabilityId = String(options.id ?? '');
        const item = items.find((candidate) => String(candidate.id) === capabilityId);
        if (!item) {
            throw new Error(`未找到 capability: ${capabilityId}`);
        }

        emitOutput(
            output,
            item,
            () =>
                [
                    `id: ${String(item.id)}`,
                    `version: ${String(item.version ?? '-')}`,
                    `description: ${String(item.description ?? '-')}`,
                    `minimumRole: ${String(item.minimumRole ?? '-')}`,
                    `auditLevel: ${String(item.auditLevel ?? '-')}`,
                    `http: ${String((item.http as Record<string, unknown>).method)} ${String(
                        (item.http as Record<string, unknown>).path,
                    )}`,
                    `cli: ${String(item.cli ?? '-')}`,
                ].join('\n'),
            [
                {
                    profile: profileName,
                    ...item,
                },
            ],
        );
        return;
    }

    throw new Error(`未知 capabilities 子命令: ${command}`);
}

async function handleKnowledge(command: string, options: Record<string, string | boolean>) {
    const output = resolveOutputMode(options);
    const { profileName } = readProfile(credentialStore, options);
    const path = command === 'search' ? '/api/knowledge/search' : '/api/knowledge/grep';
    const response = await callApi(
        path,
        {
            method: 'POST',
            body: JSON.stringify(
                command === 'search'
                    ? {
                          query: options.query,
                          limit: options.limit ? Number(options.limit) : undefined,
                          scoreThreshold: options['score-threshold'] ? Number(options['score-threshold']) : undefined,
                      }
                    : {
                          pattern: options.pattern,
                          uri: options.uri,
                          caseInsensitive:
                              options['case-insensitive'] === undefined
                                  ? undefined
                                  : options['case-insensitive'] === 'true',
                      },
            ),
        },
        options,
    );

    const items = ((response.data as Record<string, unknown>).items ?? []) as Array<Record<string, unknown>>;
    const traceId = String(response.traceId ?? '');
    emitOutput(
        output,
        response,
        () =>
            command === 'search'
                ? [`traceId: ${traceId}`, ...items.map((item) => `${String(item.uri)} [${String(item.score)}]`)].join('\n')
                : [`traceId: ${traceId}`, ...items.map((item) => `L${String(item.line)} ${String(item.uri)}\n  ${String(item.content)}`)].join(
                      '\n',
                  ),
        items.map((item) => ({
            profile: profileName,
            command,
            traceId,
            ...item,
        })),
    );
}

async function handleResources(command: string, options: Record<string, string | boolean>) {
    const output = resolveOutputMode(options);
    const { profileName } = readProfile(credentialStore, options);
    const searchParams = new URLSearchParams();
    if (options.uri) {
        searchParams.set('uri', String(options.uri));
    }
    if (options.depth) {
        searchParams.set('depth', String(options.depth));
    }

    const path =
        command === 'tree'
            ? `/api/resources/tree?${searchParams.toString()}`
            : `/api/resources?${searchParams.toString()}`;
    const response = await callApi(path, {}, options);
    const data = response.data as Record<string, unknown>;

    if (command === 'tree') {
        const payload = {
            profile: profileName,
            traceId: String(response.traceId ?? ''),
            renderedTree: String(data.renderedTree ?? ''),
        };
        emitOutput(
            output,
            response,
            () => [`traceId: ${payload.traceId}`, payload.renderedTree].join('\n'),
            [payload],
        );
        return;
    }

    const items = (data.items ?? []) as Array<Record<string, unknown>>;
    emitOutput(
        output,
        response,
        () =>
            [`traceId: ${String(response.traceId ?? '')}`, ...items.map((item) => `${item.isDir ? '[DIR]' : '[FILE]'} ${String(item.uri)}`)].join(
                '\n',
            ),
        items.map((item) => ({
            profile: profileName,
            traceId: response.traceId,
            ...item,
        })),
    );
}

async function handleConfig(command: string, options: Record<string, string | boolean>) {
    const output = resolveOutputMode(options);
    const { stateFile, profileName, profile } = readProfile(credentialStore, options);

    if (command === 'show') {
        const payload = {
            currentProfile: stateFile.currentProfile,
            profile: profileName,
            serverUrl: profile.serverUrl,
            statePath: credentialStore.getStatePath(),
            profiles: Object.keys(stateFile.profiles),
        };

        emitOutput(
            output,
            payload,
            () =>
                [
                    `currentProfile: ${payload.currentProfile}`,
                    `profile: ${payload.profile}`,
                    `serverUrl: ${payload.serverUrl}`,
                    `statePath: ${payload.statePath}`,
                    `profiles: ${payload.profiles.join(', ')}`,
                ].join('\n'),
            [payload],
        );
        return;
    }

    if (command === 'set') {
        const nextProfile = {
            ...profile,
            serverUrl: String(options.server ?? profile.serverUrl),
        };
        saveProfile(credentialStore, profileName, nextProfile, stateFile);
        const payload = {
            profile: profileName,
            serverUrl: nextProfile.serverUrl,
        };

        emitOutput(output, payload, () => `已更新 profile=${profileName} serverUrl=${nextProfile.serverUrl}`, [payload]);
        return;
    }

    if (command === 'use') {
        const nextProfileName = String(options.profile ?? '');
        if (!nextProfileName) {
            throw new Error('config use 需要 --profile');
        }

        const nextState: CliStateFile = {
            version: 2,
            currentProfile: nextProfileName,
            profiles: {
                ...stateFile.profiles,
                [nextProfileName]: stateFile.profiles[nextProfileName] ?? getDefaultProfile(),
            },
        };
        credentialStore.saveStateFile(nextState);

        const payload = {
            currentProfile: nextProfileName,
            statePath: credentialStore.getStatePath(),
        };
        emitOutput(output, payload, () => `已切换 currentProfile=${nextProfileName}`, [payload]);
        return;
    }

    throw new Error(`未知 config 子命令: ${command}`);
}

async function handleDoctor(options: Record<string, string | boolean>) {
    const output = resolveOutputMode(options);
    const { profileName, profile } = readProfile(credentialStore, options);
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
        const response = await fetch(`${profile.serverUrl}/api/capabilities`);
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
            const whoami = await callApi('/api/auth/whoami', {}, options);
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
        statePath: credentialStore.getStatePath(),
        checks,
    };

    emitOutput(
        output,
        payload,
        () =>
            [
                `profile: ${profileName}`,
                `serverUrl: ${profile.serverUrl}`,
                `statePath: ${credentialStore.getStatePath()}`,
                ...checks.map((check) =>
                    `${check.ok ? '[OK]' : '[FAIL]'} ${String(check.name)}${check.statusCode ? ` status=${String(check.statusCode)}` : ''}${
                        check.error ? ` error=${String(check.error)}` : ''
                    }${check.expiresAt ? ` expiresAt=${String(check.expiresAt)}` : ''}${check.expired !== null && check.expired !== undefined ? ` expired=${String(check.expired)}` : ''}`,
                ),
            ].join('\n'),
        checks.map((check) => ({
            profile: profileName,
            serverUrl: profile.serverUrl,
            ...check,
        })),
    );
}

function printUsage() {
    printText(`OVA CLI

用法:
  ova auth login --server http://localhost:6001 --username admin --password admin123 --tenant-code acme [--profile dev]
  ova auth sso --ticket sso-ticket [--profile dev]
  ova auth whoami [--profile dev] [--output json|jsonl]
  ova auth status [--profile dev] [--output json|jsonl]
  ova auth credential-options [--profile dev] [--output json|jsonl]
  ova auth token-exchange [--profile dev] [--save] [--output json|jsonl]
  ova auth session-exchange [--profile dev] [--save] [--output json|jsonl]
  ova auth client-credentials [--name cli-client] [--profile dev] [--save] [--output json|jsonl]
  ova auth logout [--profile dev] [--output json|jsonl]
  ova capabilities list [--profile dev] [--output json|jsonl]
  ova capabilities inspect --id knowledge.search [--profile dev] [--output json|jsonl]
  ova knowledge search --query "多租户隔离" [--limit 5] [--profile dev] [--output json|jsonl]
  ova knowledge grep --pattern "tenant" [--uri viking://resources/tenants/acme/] [--profile dev] [--output json|jsonl]
  ova resources list [--uri viking://resources/tenants/acme/] [--profile dev] [--output json|jsonl]
  ova resources tree [--uri viking://resources/tenants/acme/] [--depth 2] [--profile dev] [--output json|jsonl]
  ova config show [--profile dev] [--output json|jsonl]
  ova config set --server http://localhost:6001 [--profile dev] [--output json|jsonl]
  ova config use --profile dev [--output json|jsonl]
  ova doctor [--profile dev] [--output json|jsonl]`);
}

export async function bootstrap(argv = process.argv.slice(2)) {
    const { group, command, options } = parseOptions(argv);

    if (!group) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    switch (group) {
        case 'auth':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleAuth(command, options);
            return;
        case 'capabilities':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleCapabilities(command, options);
            return;
        case 'knowledge':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleKnowledge(command, options);
            return;
        case 'resources':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleResources(command, options);
            return;
        case 'config':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleConfig(command, options);
            return;
        case 'doctor':
            await handleDoctor(options);
            return;
        default:
            printUsage();
            process.exitCode = 1;
    }
}

if (require.main === module) {
    void bootstrap().catch((error) => {
        process.stderr.write(`${formatRuntimeError(error)}\n`);
        process.exitCode = 1;
    });
}
