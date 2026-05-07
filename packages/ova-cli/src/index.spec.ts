const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockSpawn = jest.fn(() => ({ unref: jest.fn() }));

const AUTH_STATE_PATH = 'C:\\Users\\tester\\.openviking\\ova\\auth.json';
const SKILL_ASSET_SEGMENT = 'assets\\skills\\openviking-admin\\SKILL.md';
const SAMPLE_SKILL_CONTENT = '# OpenViking Admin\n';

let currentStateRaw = '';

jest.mock('fs', () => ({
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

jest.mock('os', () => ({
    homedir: () => 'C:\\Users\\tester',
}));

jest.mock('child_process', () => ({
    spawn: (...args: unknown[]) => mockSpawn.apply(null, args),
}));

const { bootstrap } = require('./index') as typeof import('./index');

describe('ova cli', () => {
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    beforeEach(() => {
        jest.clearAllMocks();
        setStateFile(buildStateFile({
            accessToken: createToken(-60),
            refreshToken: createToken(3600),
            accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        }));
        mockExistsSync.mockImplementation((filePath: unknown) => {
            const normalized = normalizePath(filePath);
            return normalized === AUTH_STATE_PATH || normalized.includes(SKILL_ASSET_SEGMENT);
        });
        mockReadFileSync.mockImplementation((filePath: unknown) => {
            const normalized = normalizePath(filePath);
            if (normalized === AUTH_STATE_PATH) {
                return currentStateRaw;
            }
            if (normalized.includes(SKILL_ASSET_SEGMENT)) {
                return SAMPLE_SKILL_CONTENT;
            }
            return '{}';
        });
        global.fetch = jest.fn()
            .mockResolvedValueOnce(
                createJsonResponse({
                    accessToken: createToken(3600),
                    refreshToken: createToken(7200),
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    data: {
                        userId: 'user-1',
                        username: 'alice',
                        tenantId: 'tenant-1',
                        role: 'tenant_admin',
                    },
                    traceId: 'trace-1',
                }),
            ) as unknown as typeof fetch;
    });

    afterAll(() => {
        stdoutWrite.mockRestore();
    });

    it('应该在 whoami 前自动刷新过期 access token', async () => {
        await bootstrap(['auth', 'whoami']);

        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            'http://localhost:6001/api/v1/auth/refresh',
            expect.objectContaining({
                method: 'POST',
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:6001/api/v1/auth/whoami',
            expect.objectContaining({
                headers: expect.any(Headers),
            }),
        );
        expect(mockWriteFileSync).toHaveBeenCalled();
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('userId: user-1'));
    });

    it('应该输出 auth status', async () => {
        setStateFile(buildStateFile({
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }));

        await bootstrap(['auth', 'status']);

        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('authenticated: yes'));
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('profile: default'));
    });

    it('应该允许 doctor 直接携带顶层选项', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(createJsonResponse({ data: [] })) as unknown as typeof fetch;

        await bootstrap(['doctor', '--output', 'json']);

        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"checks"'));
    });

    it('应该兼容旧版单 profile 状态文件', async () => {
        setStateFile({
            serverUrl: 'http://localhost:6001',
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
        });

        await bootstrap(['auth', 'status', '--output', 'json']);

        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"profile": "default"'));
    });

    it('应该支持切换 profile', async () => {
        await bootstrap(['config', 'use', '--profile', 'prod', '--output', 'json']);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            AUTH_STATE_PATH,
            expect.stringContaining('"currentProfile": "prod"'),
            'utf8',
        );
    });

    it('应该支持 jsonl 输出', async () => {
        setStateFile(buildStateFile({
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: [
                    {
                        id: 'knowledge.search',
                        description: 'search',
                        http: { method: 'POST', path: '/api/v1/knowledge/search' },
                    },
                ],
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['capabilities', 'list', '--output', 'jsonl']);

        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"id":"knowledge.search"'));
    });

    it('应该在只有 API Key 时使用 capability key 调用能力接口', async () => {
        setStateFile(buildStateFile({
            apiKey: 'ov-sk-demo',
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: {
                    items: [{ uri: 'viking://resources/tenants/acme/doc-1', score: 0.9 }],
                },
                traceId: 'trace-api-key',
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['knowledge', 'search', '--query', '多租户隔离']);

        const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
        const headers = request.headers as Headers;
        expect(headers.get('x-capability-key')).toBe('ov-sk-demo');
        expect(headers.has('Authorization')).toBe(false);
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('traceId: trace-api-key'));
    });

    it('应该通过 configure 保存 API Key profile', async () => {
        await bootstrap([
            'configure',
            '--server',
            'https://admin.example.com',
            '--api-key',
            'ov-sk-demo',
            '--output',
            'json',
        ]);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            AUTH_STATE_PATH,
            expect.stringContaining('"apiKey": "ov-sk-demo"'),
            'utf8',
        );
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"hasApiKey": true'));
    });

    it('应该通过 configure 保存 OAuth 地址并打开浏览器', async () => {
        await bootstrap([
            'configure',
            '--server',
            'https://admin.example.com',
            '--oauth-url',
            'https://sso.example.com/oauth',
            '--open-browser',
            '--output',
            'json',
        ]);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            AUTH_STATE_PATH,
            expect.stringContaining('"oauthUrl": "https://sso.example.com/oauth"'),
            'utf8',
        );
        expect(mockSpawn).toHaveBeenCalled();
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"openedBrowser": true'));
    });

    it('应该支持 credential-options', async () => {
        setStateFile(buildStateFile({
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: {
                    login: {
                        browser: {
                            exchangeEndpoint: '/api/v1/auth/login',
                        },
                    },
                    capabilities: [
                        {
                            channel: 'cli',
                            credentialType: 'api_key',
                            issueEndpoint: '/api/v1/auth/client-credentials',
                            ttlSeconds: null,
                        },
                    ],
                },
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['auth', 'credential-options', '--output', 'json']);

        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"credentialType": "api_key"'));
    });

    it('应该支持保存 token exchange 结果到 profile', async () => {
        setStateFile(buildStateFile({
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: {
                    credentialType: 'capability_access_token',
                    accessToken: 'cap-token',
                    expiresInSeconds: 7200,
                },
                traceId: 'trace-cap-token',
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['auth', 'token-exchange', '--save', '--output', 'json']);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            AUTH_STATE_PATH,
            expect.stringContaining('"capabilityAccessToken": "cap-token"'),
            'utf8',
        );
    });

    it('应该支持保存 client credentials 结果到 profile', async () => {
        setStateFile(buildStateFile({
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: {
                    credentialType: 'api_key',
                    apiKey: 'ov-sk-demo',
                    name: 'cli-client',
                },
                traceId: 'trace-api-key',
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['auth', 'client-credentials', '--name', 'cli-client', '--save', '--output', 'json']);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            AUTH_STATE_PATH,
            expect.stringContaining('"apiKey": "ov-sk-demo"'),
            'utf8',
        );
    });

    it('应该通过 setup 自动写入 MCP 配置和全局 skill', async () => {
        setStateFile(buildStateFile({
            accessToken: createToken(3600),
            refreshToken: createToken(7200),
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: {
                    credentialType: 'api_key',
                    apiKey: 'ov-sk-bootstrap',
                    name: 'ova-mcp',
                },
                traceId: 'trace-bootstrap',
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['setup', '--editor', 'claude,cursor,codex', '--output', 'json']);

        expect(findWritePath('.claude.json')).toBeTruthy();
        expect(findWritePath('.cursor\\mcp.json')).toBeTruthy();
        expect(findWritePath('.codex\\config.toml')).toBeTruthy();
        expect(findWritePath('.claude\\skills\\openviking-admin\\SKILL.md')).toBeTruthy();
        expect(findWritePath('.cursor\\skills\\openviking-admin\\SKILL.md')).toBeTruthy();
        expect(findWritePath('.agents\\skills\\openviking-admin\\SKILL.md')).toBeTruthy();
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"credentialType": "api-key"'));
    });

    it('应该通过 init 生成 capability 快照与提示词注入块', async () => {
        setStateFile(buildStateFile({
            apiKey: 'ov-sk-demo',
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: [
                    {
                        id: 'knowledge.search',
                        description: 'search',
                        minimumRole: 'tenant_viewer',
                        http: { method: 'POST', path: '/api/v1/knowledge/search' },
                        cli: { command: 'ova knowledge search' },
                    },
                ],
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['init', '--path', 'E:\\repo', '--output', 'json']);

        expect(findWritePath('E:\\repo\\.openviking\\capabilities.json')).toBeTruthy();
        expect(findWritePath('E:\\repo\\AGENTS.md')).toBeTruthy();
        expect(findWritePath('E:\\repo\\CLAUDE.md')).toBeTruthy();
        expect(findWritePath('E:\\repo\\.claude\\skills\\openviking-admin\\SKILL.md')).toBeTruthy();
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"capabilityCount": 1'));
    });

    it('应该通过 bootstrap 串联 setup 与 init', async () => {
        setStateFile(buildStateFile({
            apiKey: 'ov-sk-demo',
        }));
        global.fetch = jest.fn().mockResolvedValueOnce(
            createJsonResponse({
                data: [
                    {
                        id: 'knowledge.search',
                        description: 'search',
                        http: { method: 'POST', path: '/api/v1/knowledge/search' },
                    },
                ],
            }),
        ) as unknown as typeof fetch;

        await bootstrap(['bootstrap', '--path', 'E:\\repo', '--editor', 'claude', '--output', 'json']);

        expect(findWritePath('.claude.json')).toBeTruthy();
        expect(findWritePath('E:\\repo\\AGENTS.md')).toBeTruthy();
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"setup"'));
        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"init"'));
    });
});

function buildStateFile(profile: Record<string, unknown>) {
    return {
        version: 2,
        currentProfile: 'default',
        profiles: {
            default: {
                serverUrl: 'http://localhost:6001',
                ...profile,
            },
        },
    };
}

function setStateFile(payload: Record<string, unknown>) {
    currentStateRaw = JSON.stringify(payload);
}

function normalizePath(filePath: unknown) {
    return String(filePath).replace(/\//g, '\\');
}

function findWritePath(target: string) {
    return mockWriteFileSync.mock.calls.find((call) => normalizePath(call[0]).includes(target));
}

function createJsonResponse(payload: Record<string, unknown>, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(payload),
    };
}

function createToken(expiresInSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
    return `${header}.${payload}.signature`;
}
