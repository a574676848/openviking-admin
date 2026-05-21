import { Readable } from 'node:stream';
import { OVClientService } from '../common/ov-client.service';
import type { Principal } from '../capabilities/domain/capability.types';
import { DocumentDraftRepository } from '../document/document-draft.repository';
import { DocumentService } from '../document/document.service';
import { WebdavMarkdownContentService } from './webdav-markdown-content.service';

describe('WebdavMarkdownContentService', () => {
  const node = {
    id: 'node-1',
    kbId: 'kb-1',
    name: '说明.md',
    contentUri: 'viking://resources/tenant-a/kb-1/node-1/content.md',
  };

  const principal: Principal = {
    userId: 'user-1',
    username: 'alice',
    tenantId: 'tenant-a',
    role: 'tenant_viewer',
    scope: 'tenant',
    credentialType: 'api_key',
    clientType: 'service',
    ovConfig: {
      baseUrl: 'https://ov.example.com',
      apiKey: 'ov-key',
      account: 'tenant-a',
    },
  };

  let documentDraftRepository: { findByNode: jest.Mock };
  let ovClientService: { requestStream: jest.Mock };
  let documentService: { loadContent: jest.Mock };
  let service: WebdavMarkdownContentService;

  beforeEach(() => {
    documentDraftRepository = {
      findByNode: jest.fn().mockResolvedValue(null),
    };
    ovClientService = {
      requestStream: jest.fn().mockResolvedValue({
        stream: Readable.from(['# 已索引正文']),
        contentLength: '19',
      }),
    };
    documentService = {
      loadContent: jest.fn().mockResolvedValue({
        markdown: '# 回退正文',
      }),
    };
    service = new WebdavMarkdownContentService(
      documentDraftRepository as unknown as DocumentDraftRepository,
      ovClientService as unknown as OVClientService,
      documentService as unknown as DocumentService,
    );
  });

  it('存在草稿时应直接返回草稿正文', async () => {
    documentDraftRepository.findByNode.mockResolvedValueOnce({
      markdown: '# 草稿正文',
      version: 2,
    });

    const result = await service.load(node, 'tenant-a', principal);

    expect(result).toEqual({ body: '# 草稿正文' });
    expect(ovClientService.requestStream).not.toHaveBeenCalled();
    expect(documentService.loadContent).not.toHaveBeenCalled();
  });

  it('无草稿且存在 contentUri 时应返回 OpenViking 响应流', async () => {
    const result = await service.load(node, 'tenant-a', principal);

    expect(result.body).toBeInstanceOf(Readable);
    expect(result.contentLength).toBe('19');
    expect(ovClientService.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-key',
        account: 'tenant-a',
        user: 'alice',
      }),
      expect.stringContaining(encodeURIComponent(node.contentUri)),
      'GET',
      undefined,
      expect.objectContaining({ user: 'alice' }),
      expect.objectContaining({ serviceLabel: 'OpenViking 内容下载' }),
    );
    expect(documentService.loadContent).not.toHaveBeenCalled();
  });

  it('无 contentUri 时应回退到文档服务兼容导入目录正文', async () => {
    const result = await service.load(
      { ...node, contentUri: null },
      'tenant-a',
      principal,
    );

    expect(result).toEqual({ body: '# 回退正文' });
    expect(documentService.loadContent).toHaveBeenCalledWith(
      'node-1',
      'tenant-a',
    );
    expect(ovClientService.requestStream).not.toHaveBeenCalled();
  });
});
