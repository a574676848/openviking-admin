import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  OpenVikingRequestException,
  OVClientService,
} from '../common/ov-client.service';
import { DocumentSessionRegistry } from '../common/document-session-registry';
import { KnowledgeNodeModel } from '../knowledge-tree/domain/knowledge-node.model';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentContentCodec } from './document-content-codec';
import { InMemoryDocumentAssetDedupStore } from './in-memory-document-asset-dedup.store';
import { DocumentService } from './document.service';
import { KnowledgeNodeAclService } from '../knowledge-tree/knowledge-node-acl.service';

type MockedOvClient = Pick<
  OVClientService,
  'request' | 'requestStream' | 'uploadTempFile'
> & {
  request: jest.Mock;
  requestStream: jest.Mock;
  uploadTempFile: jest.Mock;
};

type MockedSettingsService = Pick<SettingsService, 'resolveOVConfig'> & {
  resolveOVConfig: jest.Mock;
};

type MockedKnowledgeTreeService = Pick<
  KnowledgeTreeService,
  'findOne' | 'syncContentUri' | 'syncIndexState' | 'touch'
> & {
  findOne: jest.Mock;
  syncContentUri: jest.Mock;
  syncIndexState: jest.Mock;
  touch: jest.Mock;
};

type MockedDocumentSessionRegistry = Pick<
  DocumentSessionRegistry,
  'assertNoActiveWriteSession'
> & {
  assertNoActiveWriteSession: jest.Mock;
};

const CONTAINER_URI = 'viking://resources/tenants/tenant-1/kb-1/node-1/';
const OLD_CONTENT_URI = `${CONTAINER_URI}old.md`;
const UPDATED_AT = new Date('2026-05-12T00:00:00.000Z');

describe('DocumentService', () => {
  let service: DocumentService;
  let ovClientService: MockedOvClient;
  let settingsService: MockedSettingsService;
  let knowledgeTreeService: MockedKnowledgeTreeService;
  let documentSessionRegistry: MockedDocumentSessionRegistry;
  let knowledgeNodeAclService: {
    assertCanReadNode: jest.Mock;
  };
  let documentDraftRepository: {
    findByNode: jest.Mock;
    saveMarkdown: jest.Mock;
  };
  let knowledgeBaseService: { refreshStatsFromNodes: jest.Mock };

  beforeEach(() => {
    ovClientService = {
      request: jest.fn(),
      requestStream: jest.fn(),
      uploadTempFile: jest.fn(),
    };
    settingsService = {
      resolveOVConfig: jest.fn().mockResolvedValue({
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-key',
        account: 'tenant-account',
        user: 'user-1',
      }),
    };
    knowledgeTreeService = {
      findOne: jest.fn(),
      syncContentUri: jest.fn(),
      syncIndexState: jest.fn(),
      touch: jest.fn(),
    };
    knowledgeTreeService.syncIndexState.mockImplementation(
      async (
        _nodeId: string,
        _tenantId: string | null,
        state: Record<string, unknown>,
      ) => ({
        ...createNode({ contentUri: null }),
        ...state,
        updatedAt: UPDATED_AT,
      }),
    );
    documentSessionRegistry = {
      assertNoActiveWriteSession: jest.fn(),
    };
    knowledgeNodeAclService = {
      assertCanReadNode: jest.fn(),
    };
    documentDraftRepository = {
      findByNode: jest.fn().mockResolvedValue(null),
      saveMarkdown: jest.fn().mockResolvedValue({
        version: 1,
        markdown: '# 新正文',
      }),
    };
    knowledgeBaseService = {
      refreshStatsFromNodes: jest.fn().mockResolvedValue(null),
    };
    service = new DocumentService(
      ovClientService as unknown as OVClientService,
      settingsService as unknown as SettingsService,
      knowledgeTreeService as unknown as KnowledgeTreeService,
      knowledgeNodeAclService as unknown as KnowledgeNodeAclService,
      new DocumentContentCodec(),
      documentSessionRegistry as unknown as DocumentSessionRegistry,
      documentDraftRepository as never,
      new InMemoryDocumentAssetDedupStore(),
      knowledgeBaseService as never,
    );
  });

  it('应该返回文档元数据和协作文档名', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));

    const result = await service.getMetadata(
      'node-1',
      'tenant-1',
      'tenant_viewer',
    );

    expect(result).toMatchObject({
      nodeId: 'node-1',
      kbId: 'kb-1',
      name: '说明.md',
      readOnly: true,
      canWrite: false,
      collab: {
        path: '/collab',
        documentName: 'document:tenant-1:node-1',
      },
    });
  });

  it('目录型导入文档没有 contentUri 时应关闭协作入口', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ contentUri: null }),
    );

    const result = await service.getMetadata(
      'node-1',
      'tenant-1',
      'tenant_admin',
    );

    expect(result.collab.documentName).toBe('');
  });

  it('应该读取 contentUri Markdown 并转换为编辑器 JSON', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ contentUri: OLD_CONTENT_URI }),
    );
    ovClientService.requestStream.mockResolvedValue({
      stream: Readable.from(['# 标题\n\n正文']),
    });

    const result = await service.loadContent('node-1', 'tenant-1');

    expect(result.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
    ]);
    expect(result.markdown).toBe('# 标题\n\n正文');
    expect(ovClientService.requestStream).toHaveBeenCalledWith(
      expect.any(Object),
      `/api/v1/content/download?uri=${encodeURIComponent(OLD_CONTENT_URI)}`,
      'GET',
      undefined,
      { user: 'user-1' },
      { serviceLabel: 'OpenViking 内容下载' },
    );
  });

  it('增强 Markdown 正文读取后应完整转换为编辑器结构', async () => {
    const markdown = [
      '# 发布说明',
      '',
      '支持 **粗体**、*斜体*、~~删除线~~ 和 `inlineCode`。',
      '',
      '- [x] 已完成',
      '- [ ] 待处理',
      '',
      '| 功能 | 状态 |',
      '| :--- | ---: |',
      '| Markdown | 已接入 |',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[开始] --> B[结束]',
      '```',
    ].join('\n');
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ contentUri: OLD_CONTENT_URI }),
    );
    ovClientService.requestStream.mockResolvedValue({
      stream: Readable.from([markdown]),
    });

    const result = await service.loadContent('node-1', 'tenant-1');

    expect(result.markdown).toBe(markdown);
    expect(result.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'checkListItem',
      'checkListItem',
      'table',
      'codeBlock',
    ]);
  });

  it('contentUri 为空且资源目录不存在时应该返回空文档结构', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ contentUri: null }),
    );
    ovClientService.request.mockRejectedValueOnce(
      new OpenVikingRequestException(
        'OpenViking 资源树',
        false,
        404,
        undefined,
        undefined,
        {
          code: 'OV_UPSTREAM_NOT_FOUND',
          message: 'OpenViking 资源树 目标不存在',
        },
      ),
    );

    const result = await service.loadContent('node-1', 'tenant-1');

    expect(result.markdown).toBe('');
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ type: 'paragraph', content: [] });
    expect(ovClientService.requestStream).not.toHaveBeenCalled();
  });

  it('提供访问上下文时应拒绝无 ACL 读取权限的文档', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    knowledgeNodeAclService.assertCanReadNode.mockImplementation(() => {
      throw new ForbiddenException('当前用户无权访问该文档节点。');
    });

    await expect(
      service.loadContent('node-1', 'tenant-1', {
        userId: 'user-2',
        role: 'tenant_viewer',
      }),
    ).rejects.toThrow('当前用户无权访问该文档节点。');
  });

  it('contentUri 为空但导入目录存在 Markdown 叶子时应聚合正文', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ contentUri: null }),
    );
    ovClientService.request.mockResolvedValueOnce({
      result: [
        {
          uri: `${CONTAINER_URI}assets/image.png`,
          rel_path: 'assets/image.png',
          isDir: false,
        },
        {
          uri: `${CONTAINER_URI}b.md`,
          rel_path: 'b.md',
          isDir: false,
        },
        {
          uri: `${CONTAINER_URI}a.md`,
          rel_path: 'a.md',
          isDir: false,
        },
      ],
    });
    ovClientService.requestStream
      .mockResolvedValueOnce({ stream: Readable.from(['# A\n正文 A']) })
      .mockResolvedValueOnce({ stream: Readable.from(['# B\n正文 B']) });

    const result = await service.loadContent('node-1', 'tenant-1');

    expect(result.contentUri).toBeNull();
    expect(result.markdown).toBe('# A\n正文 A\n\n# B\n正文 B');
    expect(result.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
    ]);
    expect(ovClientService.request).toHaveBeenCalledWith(
      expect.any(Object),
      `/api/v1/fs/tree?uri=${encodeURIComponent(CONTAINER_URI)}&depth=3`,
      'GET',
      undefined,
      { user: 'user-1' },
      { serviceLabel: 'OpenViking 资源树' },
    );
  });

  it('contentUri 为空且存在空草稿时仍应回退导入目录正文', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ contentUri: null }),
    );
    documentDraftRepository.findByNode.mockResolvedValueOnce({
      version: 3,
      markdown: '',
    });
    ovClientService.request.mockResolvedValueOnce({
      result: [
        {
          uri: `${CONTAINER_URI}imported.md`,
          rel_path: 'imported.md',
          isDir: false,
        },
      ],
    });
    ovClientService.requestStream.mockResolvedValueOnce({
      stream: Readable.from(['# 导入正文']),
    });

    const result = await service.loadContent('node-1', 'tenant-1');

    expect(result.draftVersion).toBe(3);
    expect(result.markdown).toBe('# 导入正文');
  });

  it('保存正文时应该只写入草稿并标记索引过期', async () => {
    const node = createNode({ contentUri: OLD_CONTENT_URI });
    knowledgeTreeService.findOne.mockResolvedValue(node);

    const result = await service.saveContent(
      'node-1',
      'tenant-1',
      new DocumentContentCodec().markdownToBlocks('# 新正文'),
      { assertNoActiveWriteSession: true },
    );

    expect(
      documentSessionRegistry.assertNoActiveWriteSession,
    ).toHaveBeenCalledWith('node-1');
    expect(documentDraftRepository.saveMarkdown).toHaveBeenCalledWith(
      'node-1',
      'tenant-1',
      '# 新正文',
      undefined,
    );
    expect(knowledgeTreeService.syncIndexState).toHaveBeenCalledWith(
      'node-1',
      'tenant-1',
      expect.objectContaining({
        draftVersion: 1,
        indexStatus: 'dirty',
      }),
      undefined,
    );
    expect(ovClientService.uploadTempFile).not.toHaveBeenCalled();
    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(result.indexStatus).toBe('dirty');
    expect(result.updatedAt).toBe(UPDATED_AT);
  });

  it('增强 Markdown 内容保存时应以标准 Markdown 形式上传', async () => {
    const node = createNode({ contentUri: OLD_CONTENT_URI });
    knowledgeTreeService.findOne.mockResolvedValue(node);
    knowledgeTreeService.syncContentUri.mockImplementation(
      async (_nodeId: string, contentUri: string) => ({
        ...node,
        contentUri,
        updatedAt: UPDATED_AT,
      }),
    );
    const markdown = [
      '# 发布说明',
      '',
      '支持 **粗体**、*斜体*、~~删除线~~ 和 `inlineCode`。',
      '',
      '- [x] 已完成',
      '- [ ] 待处理',
      '',
      '| 功能 | 状态 |',
      '| :--- | ---: |',
      '| Markdown | 已接入 |',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[开始] --> B[结束]',
      '```',
    ].join('\n');

    await service.saveContent(
      'node-1',
      'tenant-1',
      new DocumentContentCodec().markdownToBlocks(markdown),
    );

    expect(documentDraftRepository.saveMarkdown).toHaveBeenCalledWith(
      'node-1',
      'tenant-1',
      markdown,
      undefined,
    );
    expect(ovClientService.uploadTempFile).not.toHaveBeenCalled();
  });

  it('首次保存应该只写草稿并保留 contentUri 为空', async () => {
    const node = createNode({ contentUri: null });
    knowledgeTreeService.findOne.mockResolvedValue(node);

    const result = await service.saveContent(
      'node-1',
      'tenant-1',
      new DocumentContentCodec().markdownToBlocks('正文'),
    );

    expect(ovClientService.uploadTempFile).not.toHaveBeenCalled();
    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(result.contentUri).toBeNull();
    expect(result.indexStatus).toBe('dirty');
  });

  it('索引时目标正文不存在应注入到稳定容器并回写真实正文 URI', async () => {
    const node = createNode({ contentUri: null, draftVersion: 2 });
    const indexedContentUri = `${CONTAINER_URI}content.md`;
    knowledgeTreeService.findOne.mockResolvedValue(node);
    documentDraftRepository.findByNode.mockResolvedValue({
      nodeId: 'node-1',
      tenantId: 'tenant-1',
      version: 3,
      markdown: '# 最新草稿',
      updatedAt: UPDATED_AT,
    });
    ovClientService.request
      .mockRejectedValueOnce(
        new OpenVikingRequestException(
          'OpenViking Resources',
          false,
          HttpStatus.NOT_FOUND,
          undefined,
          undefined,
          {
            code: 'OV_UPSTREAM_NOT_FOUND',
            message: 'OpenViking Resources 目标不存在',
          },
        ),
      )
      .mockResolvedValueOnce({ result: { status: 'success' } })
      .mockResolvedValueOnce({
        result: [
          {
            uri: indexedContentUri,
            isDir: false,
          },
        ],
      })
      .mockResolvedValueOnce({ result: { count: 8 } });
    ovClientService.uploadTempFile.mockResolvedValue({
      result: { temp_file_id: 'manual-index-temp-1' },
    });

    const result = await service.indexContent('node-1', 'tenant-1');

    expect(ovClientService.request).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      '/api/v1/content/write',
      'POST',
      expect.objectContaining({
        uri: indexedContentUri,
        content: '# 最新草稿',
        mode: 'replace',
        wait: false,
      }),
      { user: 'user-1' },
      { serviceLabel: 'OpenViking Resources' },
    );
    expect(ovClientService.uploadTempFile).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/v1/resources/temp_upload',
      expect.objectContaining({
        fileName: 'content.md',
        mimeType: 'text/markdown;charset=utf-8',
      }),
      { user: 'user-1' },
      { serviceLabel: 'OpenViking Resources' },
    );
    expect(ovClientService.request).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        temp_file_id: 'manual-index-temp-1',
        to: CONTAINER_URI,
        reason: 'manual-index',
        wait: true,
      }),
      { user: 'user-1' },
      { serviceLabel: 'OpenViking Resources' },
    );
    expect(knowledgeTreeService.syncIndexState).toHaveBeenLastCalledWith(
      'node-1',
      'tenant-1',
      expect.objectContaining({
        contentUri: indexedContentUri,
        indexStatus: 'clean',
        indexedVersion: 3,
        vectorCount: 8,
      }),
      undefined,
    );
    expect(result.contentUri).toBe(indexedContentUri);
    expect(result.vectorCount).toBe(8);
    expect(knowledgeBaseService.refreshStatsFromNodes).toHaveBeenCalledWith(
      'kb-1',
      'tenant-1',
      undefined,
    );
  });

  it('索引时 OpenViking 资源忙应保持 indexing 状态并快速返回', async () => {
    const node = createNode({
      contentUri: `${CONTAINER_URI}content.md`,
      draftVersion: 3,
      indexedVersion: 2,
      vectorCount: 1,
      lastIndexedAt: UPDATED_AT,
    });
    knowledgeTreeService.findOne.mockResolvedValue(node);
    documentDraftRepository.findByNode.mockResolvedValue({
      nodeId: 'node-1',
      tenantId: 'tenant-1',
      version: 4,
      markdown: '# 最新草稿',
      updatedAt: UPDATED_AT,
    });
    knowledgeTreeService.syncIndexState.mockImplementation(
      async (
        _nodeId: string,
        _tenantId: string | null,
        state: Record<string, unknown>,
      ) => ({
        ...node,
        ...state,
        updatedAt: UPDATED_AT,
      }),
    );
    ovClientService.request.mockRejectedValueOnce(
      new OpenVikingRequestException(
        'OpenViking Resources',
        false,
        HttpStatus.BAD_REQUEST,
        undefined,
        undefined,
        {
          code: 'OV_UPSTREAM_BAD_REQUEST',
          message: `resource is busy and cannot be written now: ${CONTAINER_URI}content.md`,
        },
      ),
    );

    const result = await service.indexContent('node-1', 'tenant-1');

    expect(knowledgeTreeService.syncIndexState).toHaveBeenLastCalledWith(
      'node-1',
      'tenant-1',
      expect.objectContaining({
        contentUri: `${CONTAINER_URI}content.md`,
        indexStatus: 'indexing',
        draftVersion: 4,
        indexError: null,
      }),
      undefined,
    );
    expect(result).toMatchObject({
      contentUri: `${CONTAINER_URI}content.md`,
      draftVersion: 4,
      indexedVersion: 2,
      indexStatus: 'indexing',
      vectorCount: 1,
      lastIndexedAt: UPDATED_AT,
    });
  });

  it('索引后向量数仍为 0 时不应过早标记为 clean', async () => {
    const node = createNode({
      contentUri: `${CONTAINER_URI}content.md`,
      draftVersion: 3,
      indexedVersion: 2,
      vectorCount: 1,
      lastIndexedAt: UPDATED_AT,
    });
    knowledgeTreeService.findOne.mockResolvedValue(node);
    documentDraftRepository.findByNode.mockResolvedValue({
      nodeId: 'node-1',
      tenantId: 'tenant-1',
      version: 4,
      markdown: '# 最新草稿',
      updatedAt: UPDATED_AT,
    });
    knowledgeTreeService.syncIndexState.mockImplementation(
      async (
        _nodeId: string,
        _tenantId: string | null,
        state: Record<string, unknown>,
      ) => ({
        ...node,
        ...state,
        updatedAt: UPDATED_AT,
      }),
    );
    ovClientService.request
      .mockResolvedValueOnce({ result: { status: 'success' } })
      .mockResolvedValueOnce({ result: { count: 0 } });

    const result = await service.indexContent('node-1', 'tenant-1');

    expect(knowledgeTreeService.syncIndexState).toHaveBeenLastCalledWith(
      'node-1',
      'tenant-1',
      expect.objectContaining({
        contentUri: `${CONTAINER_URI}content.md`,
        indexStatus: 'indexing',
        draftVersion: 4,
        indexedVersion: 2,
        vectorCount: 0,
        lastIndexedAt: UPDATED_AT,
      }),
      undefined,
    );
    expect(result).toMatchObject({
      contentUri: `${CONTAINER_URI}content.md`,
      draftVersion: 4,
      indexedVersion: 2,
      indexStatus: 'indexing',
      vectorCount: 0,
      lastIndexedAt: UPDATED_AT,
    });
  });

  it('应该上传资产到 assets 子目录并返回相对路径', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    ovClientService.uploadTempFile.mockResolvedValue({
      result: { temp_file_id: 'asset-temp-1' },
    });
    ovClientService.request
      .mockResolvedValueOnce({ result: [] })
      .mockResolvedValueOnce({
        result: { status: 'success' },
      })
      .mockResolvedValueOnce({
        result: [
          {
            uri: `${CONTAINER_URI}assets/asset-1-截图.png`,
            isDir: false,
          },
        ],
      });

    const result = await service.uploadAsset('node-1', 'tenant-1', {
      originalname: '截图.png',
      mimetype: 'image/png',
      buffer: Buffer.from('image'),
      size: 5,
    });

    expect(result.path).toBe('assets/asset-1-截图.png');
    expect(result.uri).toContain(`${CONTAINER_URI}assets/`);
    expect(ovClientService.request).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        temp_file_id: 'asset-temp-1',
        to: `${CONTAINER_URI}assets/`,
        reason: 'collab-asset-upload',
      }),
      { user: 'user-1' },
      { serviceLabel: 'OpenViking Resources' },
    );
    expect(ovClientService.request).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      expect.stringContaining(
        `/api/v1/fs/tree?uri=${encodeURIComponent(`${CONTAINER_URI}assets/`)}&depth=1`,
      ),
      'GET',
      undefined,
      { user: 'user-1' },
      { serviceLabel: 'OpenViking 资源树' },
    );
    expect(knowledgeTreeService.touch).toHaveBeenCalledWith(
      'node-1',
      'tenant-1',
      undefined,
    );
  });

  it('OpenViking 确认到的真实资产叶子文件名变化时应返回真实相对路径', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    ovClientService.uploadTempFile.mockResolvedValue({
      result: { temp_file_id: 'asset-temp-1' },
    });
    ovClientService.request
      .mockResolvedValueOnce({ result: [] })
      .mockResolvedValueOnce({
        result: { status: 'success' },
      })
      .mockResolvedValueOnce({
        result: [
          {
            uri: `${CONTAINER_URI}assets/asset-final-visible.png`,
            isDir: false,
          },
        ],
      });

    const result = await service.uploadAsset('node-1', 'tenant-1', {
      originalname: 'visible.png',
      mimetype: 'image/png',
      buffer: Buffer.from('image'),
      size: 5,
    });

    expect(result).toEqual({
      path: 'assets/asset-final-visible.png',
      uri: `${CONTAINER_URI}assets/asset-final-visible.png`,
    });
  });

  it('资产叶子短暂未可见时应轮询资源树后再返回 URI', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    ovClientService.uploadTempFile.mockResolvedValue({
      result: { temp_file_id: 'asset-temp-1' },
    });
    ovClientService.request
      .mockResolvedValueOnce({ result: [] })
      .mockResolvedValueOnce({
        result: { status: 'success' },
      })
      .mockResolvedValueOnce({ result: [] })
      .mockResolvedValueOnce({
        result: [
          {
            uri: `${CONTAINER_URI}assets/asset-visible.png`,
            isDir: false,
          },
        ],
      });

    const result = await service.uploadAsset('node-1', 'tenant-1', {
      originalname: 'visible.png',
      mimetype: 'image/png',
      buffer: Buffer.from('image'),
      size: 5,
    });

    expect(result.uri).toBe(`${CONTAINER_URI}assets/asset-visible.png`);
    expect(ovClientService.request).toHaveBeenCalledTimes(4);
  });

  it('命中同文档缓存去重索引时不应重复上传资产', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    ovClientService.request.mockResolvedValueOnce({
      result: [
        {
          uri: `${CONTAINER_URI}assets/existing.png`,
          isDir: false,
        },
      ],
    });
    ovClientService.requestStream.mockResolvedValue({
      stream: Readable.from([Buffer.from('same-image')]),
    });

    const firstResult = await service.uploadAsset('node-1', 'tenant-1', {
      originalname: 'a.png',
      mimetype: 'image/png',
      buffer: Buffer.from('same-image'),
      size: 10,
    });
    const secondResult = await service.uploadAsset('node-1', 'tenant-1', {
      originalname: 'b.png',
      mimetype: 'image/png',
      buffer: Buffer.from('same-image'),
      size: 10,
    });

    expect(firstResult.path).toBe('assets/existing.png');
    expect(secondResult.path).toBe('assets/existing.png');
    expect(ovClientService.uploadTempFile).not.toHaveBeenCalled();
    expect(ovClientService.request).toHaveBeenCalledTimes(1);
  });

  it('应该从 assets 子目录读取资产流', async () => {
    const stream = Readable.from(['image']);
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    ovClientService.requestStream.mockResolvedValue({ stream });

    const result = await service.loadAsset('node-1', 'tenant-1', '截图.png');

    expect(result.stream).toBe(stream);
    expect(ovClientService.requestStream).toHaveBeenCalledWith(
      expect.any(Object),
      `/api/v1/content/download?uri=${encodeURIComponent(`${CONTAINER_URI}assets/截图.png`)}`,
      'GET',
      undefined,
      { user: 'user-1' },
      {
        serviceLabel: 'OpenViking 内容下载',
        retryCount: 2,
        retryDelayMs: 200,
      },
    );
  });

  it('资产短暂 404 时应重试后再读取成功', async () => {
    const stream = Readable.from(['image']);
    knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
    ovClientService.requestStream
      .mockRejectedValueOnce(
        new OpenVikingRequestException(
          'OpenViking 内容下载',
          false,
          404,
          undefined,
          undefined,
          {
            code: 'OV_UPSTREAM_NOT_FOUND',
            message: 'OpenViking 内容下载 目标不存在',
          },
        ),
      )
      .mockRejectedValueOnce(
        new OpenVikingRequestException(
          'OpenViking 内容下载',
          false,
          404,
          undefined,
          undefined,
          {
            code: 'OV_UPSTREAM_NOT_FOUND',
            message: 'OpenViking 内容下载 目标不存在',
          },
        ),
      )
      .mockResolvedValueOnce({ stream });

    const result = await service.loadAsset('node-1', 'tenant-1', '截图.png');

    expect(result.stream).toBe(stream);
    expect(ovClientService.requestStream).toHaveBeenCalledTimes(3);
  });

  it('非文档节点不允许读写', async () => {
    knowledgeTreeService.findOne.mockResolvedValue(
      createNode({ kind: 'collection' }),
    );

    await expect(service.loadContent('node-1', 'tenant-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('warmDraft', () => {
    it('应下载 OV 内容并保存为草稿，不标记为 dirty', async () => {
      const markdown = '# 预热内容\n\n这是导入后的正文。';
      ovClientService.requestStream.mockResolvedValue({
        stream: Readable.from([Buffer.from(markdown, 'utf-8')]),
        headers: {},
      });
      knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
      documentDraftRepository.saveMarkdown.mockResolvedValue({
        version: 1,
        markdown,
      });
      knowledgeTreeService.syncIndexState.mockResolvedValue(createNode({ draftVersion: 1 }));

      await service.warmDraft('node-1', 'tenant-1', OLD_CONTENT_URI);

      expect(documentDraftRepository.saveMarkdown).toHaveBeenCalledWith(
        'node-1',
        'tenant-1',
        markdown,
      );
      // 不应该设置 indexStatus 为 dirty
      expect(knowledgeTreeService.syncIndexState).toHaveBeenCalledWith(
        'node-1',
        'tenant-1',
        { draftVersion: 1 },
      );
    });

    it('内容为空时不应写入草稿', async () => {
      ovClientService.requestStream.mockResolvedValue({
        stream: Readable.from([Buffer.from('   ', 'utf-8')]),
        headers: {},
      });
      knowledgeTreeService.findOne.mockResolvedValue(createNode({}));

      await service.warmDraft('node-1', 'tenant-1', OLD_CONTENT_URI);

      expect(documentDraftRepository.saveMarkdown).not.toHaveBeenCalled();
    });

    it('下载失败时应静默捕获异常', async () => {
      ovClientService.requestStream.mockRejectedValue(new Error('网络超时'));
      knowledgeTreeService.findOne.mockResolvedValue(createNode({}));

      // 不应抛出异常
      await expect(
        service.warmDraft('node-1', 'tenant-1', OLD_CONTENT_URI),
      ).resolves.toBeUndefined();
    });
  });

  describe('getMetadata - draftReady', () => {
    it('有草稿时 draftReady 应为 true', async () => {
      knowledgeTreeService.findOne.mockResolvedValue(createNode({}));
      documentDraftRepository.findByNode.mockResolvedValue({
        version: 1,
        markdown: '# 内容',
      });

      const result = await service.getMetadata('node-1', 'tenant-1', 'tenant_admin');

      expect(result.draftReady).toBe(true);
    });

    it('无草稿但无 contentUri 时 draftReady 应为 true', async () => {
      knowledgeTreeService.findOne.mockResolvedValue(
        createNode({ contentUri: null }),
      );
      documentDraftRepository.findByNode.mockResolvedValue(null);

      const result = await service.getMetadata('node-1', 'tenant-1', 'tenant_admin');

      expect(result.draftReady).toBe(true);
    });

    it('无草稿但有 contentUri 时 draftReady 应为 false', async () => {
      knowledgeTreeService.findOne.mockResolvedValue(
        createNode({ contentUri: OLD_CONTENT_URI }),
      );
      documentDraftRepository.findByNode.mockResolvedValue(null);

      const result = await service.getMetadata('node-1', 'tenant-1', 'tenant_admin');

      expect(result.draftReady).toBe(false);
    });
  });
});

function createNode(
  overrides: Partial<KnowledgeNodeModel>,
): KnowledgeNodeModel {
  return {
    id: 'node-1',
    tenantId: 'tenant-1',
    kbId: 'kb-1',
    parentId: null,
    name: '说明.md',
    path: null,
    sortOrder: 1,
    acl: null,
    kind: 'document',
    vikingUri: CONTAINER_URI,
    contentUri: OLD_CONTENT_URI,
    indexStatus: 'clean',
    draftVersion: 0,
    indexedVersion: 0,
    vectorCount: null,
    lastIndexedAt: null,
    indexError: null,
    createdAt: new Date('2026-05-12T00:00:00.000Z'),
    updatedAt: new Date('2026-05-12T00:00:00.000Z'),
    ...overrides,
  };
}
