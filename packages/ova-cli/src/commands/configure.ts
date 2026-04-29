import { spawn } from 'child_process';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { decodeJwtExp } from '../token';
import type { CredentialStore } from '../state-store';
import { readProfile, saveProfile } from '../state-store';
import { emitOutput, resolveOutputMode } from '../output';

const DEFAULT_PROFILE = 'default';
const DEFAULT_SERVER_URL = 'http://localhost:6001';
const AUTH_METHOD_API_KEY = 'api-key';
const AUTH_METHOD_OAUTH = 'oauth';
const OPEN_BROWSER_TRUE = 'true';

interface ConfigureAnswers {
    serverUrl?: string;
    apiKey?: string;
    oauthUrl?: string;
    openBrowser?: boolean;
    ssoTicket?: string;
}

export async function handleConfigure(
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const outputMode = resolveOutputMode(options);
    const { stateFile, profileName, profile } = readProfile(store, options);
    const interactive = !hasConfigureOptions(options);
    const answers: ConfigureAnswers = interactive ? await readInteractiveOptions(profile) : {};
    const serverUrl = String(options.server ?? answers.serverUrl ?? profile.serverUrl ?? DEFAULT_SERVER_URL);
    const apiKey = readOption(options['api-key'] ?? answers.apiKey);
    const oauthUrl = readOption(options['oauth-url'] ?? answers.oauthUrl ?? profile.oauthUrl);
    const shouldOpenBrowser = resolveOpenBrowser(options, answers);
    const ssoTicket = readOption(options['sso-ticket'] ?? answers.ssoTicket);

    let nextProfile = {
        ...profile,
        serverUrl,
        oauthUrl,
        apiKey: apiKey ?? profile.apiKey,
    };

    if (oauthUrl && shouldOpenBrowser) {
        openBrowser(oauthUrl);
    }

    if (ssoTicket) {
        nextProfile = {
            ...nextProfile,
            ...(await exchangeSsoTicket(serverUrl, ssoTicket)),
        };
    }

    saveProfile(store, profileName || DEFAULT_PROFILE, nextProfile, stateFile);

    const payload = {
        profile: profileName || DEFAULT_PROFILE,
        serverUrl: nextProfile.serverUrl,
        oauthUrl: nextProfile.oauthUrl,
        hasApiKey: Boolean(nextProfile.apiKey),
        authenticated: Boolean(nextProfile.accessToken),
        openedBrowser: Boolean(oauthUrl && shouldOpenBrowser),
        statePath: store.getStatePath(),
    };

    emitOutput(
        outputMode,
        payload,
        () =>
            [
                `profile: ${payload.profile}`,
                `serverUrl: ${payload.serverUrl}`,
                `oauthUrl: ${payload.oauthUrl ?? '-'}`,
                `hasApiKey: ${payload.hasApiKey ? 'yes' : 'no'}`,
                `authenticated: ${payload.authenticated ? 'yes' : 'no'}`,
                `openedBrowser: ${payload.openedBrowser ? 'yes' : 'no'}`,
                `statePath: ${payload.statePath}`,
            ].join('\n'),
        [payload],
    );
}

async function readInteractiveOptions(profile: { serverUrl?: string; oauthUrl?: string }): Promise<ConfigureAnswers> {
    if (!input.isTTY) {
        throw new Error('configure 需要交互式终端，或显式传入 --api-key / --oauth-url / --server');
    }

    const rl = createInterface({ input, output });
    try {
        const serverUrl = await ask(rl, `OpenViking 服务地址`, profile.serverUrl ?? DEFAULT_SERVER_URL);
        const method = await ask(rl, `认证方式 (${AUTH_METHOD_API_KEY}/${AUTH_METHOD_OAUTH})`, AUTH_METHOD_API_KEY);

        if (method.trim() === AUTH_METHOD_OAUTH) {
            const oauthUrl = await ask(rl, 'OAuth 授权地址', profile.oauthUrl ?? '');
            const openAnswer = await ask(rl, '是否立即打开浏览器授权 (Y/n)', 'Y');
            const ssoTicket = await ask(rl, '如果授权回跳 URL 中包含 sso_ticket，请粘贴；没有则直接回车', '');
            return {
                serverUrl,
                oauthUrl,
                openBrowser: openAnswer.toLowerCase() !== 'n',
                ssoTicket,
            };
        }

        const apiKey = await ask(rl, 'API Key', '');
        return {
            serverUrl,
            apiKey,
        };
    } finally {
        rl.close();
    }
}

async function ask(rl: ReturnType<typeof createInterface>, label: string, defaultValue: string) {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${label}${suffix}: `);
    return answer.trim() || defaultValue;
}

function hasConfigureOptions(options: Record<string, string | boolean>) {
    return Boolean(
        options.server ||
            options['api-key'] ||
            options['oauth-url'] ||
            options['open-browser'] ||
            options['sso-ticket'],
    );
}

function readOption(value: string | boolean | undefined) {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed || undefined;
}

function resolveOpenBrowser(
    options: Record<string, string | boolean>,
    answers: ConfigureAnswers,
) {
    if (options['open-browser'] === true) {
        return true;
    }

    if (typeof options['open-browser'] === 'string') {
        return options['open-browser'] === OPEN_BROWSER_TRUE;
    }

    return Boolean(answers.openBrowser);
}

function openBrowser(url: string) {
    const command =
        process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
}

async function exchangeSsoTicket(serverUrl: string, ticket: string) {
    const response = await fetch(`${serverUrl}/api/v1/auth/sso/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    const data = (payload.data ?? payload) as Record<string, unknown>;
    const accessToken = String(data.accessToken ?? '');
    const refreshToken = String(data.refreshToken ?? '');

    if (!response.ok || !accessToken || !refreshToken) {
        throw new Error(String(payload.message ?? payload.error ?? 'SSO 授权失败'));
    }

    return {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: decodeJwtExp(accessToken),
        refreshTokenExpiresAt: decodeJwtExp(refreshToken),
    };
}
