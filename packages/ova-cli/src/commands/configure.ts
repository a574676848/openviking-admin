import { spawn } from 'child_process';
import { createServer } from 'http';
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
const DEFAULT_CALLBACK_PORT = 63637;
const CALLBACK_PATH = '/callback';
const OAUTH_CALLBACK_TIMEOUT_MS = 120_000;

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
    const callbackPort = resolveCallbackPort(options);

    let nextProfile = {
        ...profile,
        serverUrl,
        oauthUrl,
        apiKey: apiKey ?? profile.apiKey,
    };

    let callbackResult: OAuthLoginResult | null = null;
    if (oauthUrl && shouldOpenBrowser && !ssoTicket) {
        callbackResult = await completeBrowserOAuthLogin(serverUrl, oauthUrl, callbackPort);
        nextProfile = {
            ...nextProfile,
            ...callbackResult.tokens,
        };
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
        callbackUrl: callbackResult?.callbackUrl,
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
                `callbackUrl: ${payload.callbackUrl ?? '-'}`,
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
            options['callback-port'] ||
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

interface OAuthCallbackResult {
    ticket: string;
    callbackUrl: string;
}

export interface OAuthLoginResult {
    callbackUrl: string;
    tokens: Awaited<ReturnType<typeof exchangeSsoTicket>>;
}

export async function completeBrowserOAuthLogin(
    serverUrl: string,
    oauthUrl: string,
    preferredPort = DEFAULT_CALLBACK_PORT,
): Promise<OAuthLoginResult> {
    const callback = await waitForOAuthCallback(preferredPort);
    openBrowser(appendRedirectParam(oauthUrl, callback.callbackUrl));
    const result = await callback.result;
    return {
        callbackUrl: result.callbackUrl,
        tokens: await exchangeSsoTicket(serverUrl, result.ticket),
    };
}

function waitForOAuthCallback(preferredPort: number) {
    let timeout: NodeJS.Timeout | undefined;
    let serverPort = preferredPort;
    let callbackUrl = '';
    let completeCallback:
        | ((error: Error | null, value?: OAuthCallbackResult) => void)
        | undefined;

    const server = createServer((req, res) => {
        const currentUrl = new URL(req.url ?? '/', callbackUrl);
        const ticket = currentUrl.searchParams.get('sso_ticket');
        const error = currentUrl.searchParams.get('error');
        if (error || !ticket) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>OpenViking Admin 授权失败</h1><p>请回到终端查看错误。</p>');
            completeCallback?.(new Error(error ?? '授权回调缺少 sso_ticket'));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>OpenViking Admin 授权成功</h1><p>可以关闭这个浏览器窗口。</p>');
        completeCallback?.(null, {
            ticket,
            callbackUrl,
        });
    });

    const result = new Promise<OAuthCallbackResult>((resolve, reject) => {
        let settled = false;
        function complete(error: Error | null, value?: OAuthCallbackResult) {
            if (settled) {
                return;
            }
            settled = true;
            if (timeout) {
                clearTimeout(timeout);
            }
            server.close();
            if (error) {
                reject(error);
                return;
            }
            resolve(value!);
        }
        completeCallback = complete;
        timeout = setTimeout(
            () => complete(new Error('等待 OAuth 回调超时')),
            OAUTH_CALLBACK_TIMEOUT_MS,
        );
    });

    const listen = new Promise<void>((resolve, reject) => {
        server.once('error', (error) => {
            completeCallback?.(error instanceof Error ? error : new Error(String(error)));
            reject(error);
        });
        server.listen(preferredPort, '127.0.0.1', () => {
            const address = server.address();
            serverPort = typeof address === 'object' && address ? address.port : preferredPort;
            callbackUrl = `http://127.0.0.1:${serverPort}${CALLBACK_PATH}`;
            resolve();
        });
    });

    return listen.then(() => ({ callbackUrl, result }));
}

function appendRedirectParam(oauthUrl: string, callbackUrl: string) {
    const url = new URL(oauthUrl);
    url.searchParams.set('redirect', callbackUrl);
    return url.toString();
}

function resolveCallbackPort(options: Record<string, string | boolean>) {
    if (typeof options['callback-port'] !== 'string') {
        return DEFAULT_CALLBACK_PORT;
    }
    const value = Number(options['callback-port']);
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new Error('--callback-port 必须是 0-65535 之间的整数');
    }
    return value;
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
