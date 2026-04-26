const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.mock('fs', () => ({
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

jest.mock('os', () => ({
    homedir: () => 'C:\\Users\\tester',
}));

const { bootstrap } = require('./index') as typeof import('./index');

describe('ova cli', () => {
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    beforeEach(() => {
        jest.clearAllMocks();
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                version: 2,
                currentProfile: 'default',
                profiles: {
                    default: {
                        serverUrl: 'http://localhost:6001',
                        accessToken: createToken(-60),
                        refreshToken: createToken(3600),
                        accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
                        refreshTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                    },
                },
            }),
        );
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
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                version: 2,
                currentProfile: 'default',
                profiles: {
                    default: {
                        serverUrl: 'http://localhost:6001',
                        accessToken: createToken(3600),
                        refreshToken: createToken(7200),
                        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
                    },
                },
            }),
        );

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
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                serverUrl: 'http://localhost:6001',
                accessToken: createToken(3600),
                refreshToken: createToken(7200),
            }),
        );

        await bootstrap(['auth', 'status', '--output', 'json']);

        expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"profile": "default"'));
    });

    it('应该支持切换 profile', async () => {
        await bootstrap(['config', 'use', '--profile', 'prod', '--output', 'json']);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            'C:\\Users\\tester\\.openviking\\ova\\auth.json',
            expect.stringContaining('"currentProfile": "prod"'),
            'utf8',
        );
    });

    it('应该支持 jsonl 输出', async () => {
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                version: 2,
                currentProfile: 'default',
                profiles: {
                    default: {
                        serverUrl: 'http://localhost:6001',
                        accessToken: createToken(3600),
                        refreshToken: createToken(7200),
                        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
                    },
                },
            }),
        );
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

    it('应该支持 credential-options', async () => {
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                version: 2,
                currentProfile: 'default',
                profiles: {
                    default: {
                        serverUrl: 'http://localhost:6001',
                        accessToken: createToken(3600),
                        refreshToken: createToken(7200),
                        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
                    },
                },
            }),
        );
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
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                version: 2,
                currentProfile: 'default',
                profiles: {
                    default: {
                        serverUrl: 'http://localhost:6001',
                        accessToken: createToken(3600),
                        refreshToken: createToken(7200),
                        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
                    },
                },
            }),
        );
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
            'C:\\Users\\tester\\.openviking\\ova\\auth.json',
            expect.stringContaining('"capabilityAccessToken": "cap-token"'),
            'utf8',
        );
    });

    it('应该支持保存 client credentials 结果到 profile', async () => {
        mockReadFileSync.mockReturnValue(
            JSON.stringify({
                version: 2,
                currentProfile: 'default',
                profiles: {
                    default: {
                        serverUrl: 'http://localhost:6001',
                        accessToken: createToken(3600),
                        refreshToken: createToken(7200),
                        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
                    },
                },
            }),
        );
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
            'C:\\Users\\tester\\.openviking\\ova\\auth.json',
            expect.stringContaining('"apiKey": "ov-sk-demo"'),
            'utf8',
        );
    });
});

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
