import { DingTalkIntegrator } from './dingtalk.integrator';

describe('DingTalkIntegrator', () => {
  const integrator = new DingTalkIntegrator();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('应通过钉钉应用 Token 解析文档链接并拉取正文块', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'app-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          node: {
            uuid: 'doc-uuid',
            nodeId: 'node-id',
            name: '钉钉方案',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          blocks: [{ paragraph: { text: '钉钉正文' } }],
        }),
      });
    global.fetch = fetchMock as never;

    const result = await integrator.resolveConfig(
      {
        type: 'dingtalk',
        credentials: {
          appId: 'dingxxx',
          appSecret: 'secret',
          operatorId: 'union-id',
        },
        config: null,
      } as never,
      'https://alidocs.dingtalk.com/i/nodes/abc123',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.dingtalk.com/v1.0/oauth2/accessToken',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey: 'dingxxx', appSecret: 'secret' }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.dingtalk.com/v2.0/wiki/nodes/queryByUrl?operatorId=union-id',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-acs-dingtalk-access-token': 'app-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.dingtalk.com/v1.0/doc/suites/documents/doc-uuid/blocks/query',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-acs-dingtalk-access-token': 'app-token',
        }),
      }),
    );
    expect(result.tempFile?.fileName).toBe('钉钉方案.md');
    expect(result.tempFile?.buffer.toString('utf8')).toContain('钉钉正文');
  });

  it('没有 operatorId 时应直接失败，避免向 OpenViking 透传 dingtalk_token', async () => {
    await expect(
      integrator.resolveConfig(
        {
          type: 'dingtalk',
          credentials: { appId: 'dingxxx', appSecret: 'secret' },
          config: null,
        } as never,
        'https://alidocs.dingtalk.com/i/nodes/abc123',
      ),
    ).rejects.toThrow('operatorId');
  });
});
