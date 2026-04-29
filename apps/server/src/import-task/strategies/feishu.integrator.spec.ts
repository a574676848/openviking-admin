import { FeishuIntegrator } from './feishu.integrator';

describe('FeishuIntegrator', () => {
  const integrator = new FeishuIntegrator();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('应真实拉取飞书文档信息和正文并转换为临时文件', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: 'ok',
          tenant_access_token: 'tenant-token',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: 'ok',
          data: { document: { title: '部署报告', revision_id: '2' } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: 'ok',
          data: { content: '正文内容' },
        }),
      });
    global.fetch = fetchMock as never;

    const result = await integrator.resolveConfig(
      {
        type: 'feishu',
        credentials: { appId: 'cli_xxx', appSecret: 'secret' },
      } as never,
      'https://my.feishu.cn/docx/Wuqodles8oy3TDxmI9ucAJdSnYJ?from=from_copylink',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://open.feishu.cn/open-apis/docx/v1/documents/Wuqodles8oy3TDxmI9ucAJdSnYJ',
      { headers: { Authorization: 'Bearer tenant-token' } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://open.feishu.cn/open-apis/docx/v1/documents/Wuqodles8oy3TDxmI9ucAJdSnYJ/raw_content',
      { headers: { Authorization: 'Bearer tenant-token' } },
    );
    expect(result).toEqual({
      tempFile: {
        fileName: '部署报告.md',
        buffer: expect.any(Buffer),
        mimeType: 'text/markdown;charset=utf-8',
      },
    });
    expect(result.tempFile?.buffer.toString('utf8')).toContain('正文内容');
  });
});
