import {
  BadRequestException,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import {
  DOCUMENT_ASSET_NOSNIFF_HEADER,
  documentAssetFileFilter,
} from './constants';
import { DocumentController } from './document.controller';

describe('DocumentController', () => {
  const documentService = {
    getMetadata: jest.fn(),
    loadContent: jest.fn(),
    saveContent: jest.fn(),
    uploadAsset: jest.fn(),
    loadAsset: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new DocumentController(
    documentService as never,
    auditService as never,
  );
  const req = {
    tenantScope: 'tenant-alpha',
    user: {
      id: 'user-1',
      username: 'alice',
      role: 'tenant_operator',
      tenantId: 'tenant-alpha',
    },
    headers: { 'x-request-id': 'request-1' },
    ip: '127.0.0.1',
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应该返回文档元数据', async () => {
    documentService.getMetadata.mockResolvedValue({
      nodeId: 'node-1',
      readOnly: false,
    });

    await expect(controller.getMetadata('node-1', req)).resolves.toEqual({
      nodeId: 'node-1',
      readOnly: false,
    });
    expect(documentService.getMetadata).toHaveBeenCalledWith(
      'node-1',
      'tenant-alpha',
      'tenant_operator',
      { userId: 'user-1', role: 'tenant_operator' },
    );
  });

  it('应该读取文档内容', async () => {
    documentService.loadContent.mockResolvedValue({
      nodeId: 'node-1',
      blocks: [],
    });

    await expect(controller.loadContent('node-1', req)).resolves.toEqual({
      nodeId: 'node-1',
      blocks: [],
    });
    expect(documentService.loadContent).toHaveBeenCalledWith(
      'node-1',
      'tenant-alpha',
      { userId: 'user-1', role: 'tenant_operator' },
    );
  });

  it('保存正文时应该启用协作写会话检查并记录审计', async () => {
    documentService.saveContent.mockResolvedValue({
      nodeId: 'node-1',
      contentUri: 'viking://content.md',
      updatedAt: new Date('2026-05-12T00:00:00.000Z'),
    });

    await controller.saveContent('node-1', { blocks: [] }, req);

    expect(documentService.saveContent).toHaveBeenCalledWith(
      'node-1',
      'tenant-alpha',
      [],
      { assertNoActiveWriteSession: true },
      { id: 'user-1', username: 'alice' },
      { userId: 'user-1', role: 'tenant_operator' },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document_save_content',
        target: 'node-1',
        tenantId: 'tenant-alpha',
      }),
    );
  });

  it('保存正文缺少 blocks 时应该拒绝', async () => {
    await expect(controller.saveContent('node-1', {}, req)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('应该上传多个资产并记录审计', async () => {
    documentService.uploadAsset
      .mockResolvedValueOnce({ path: 'assets/a.png', uri: 'viking://a.png' })
      .mockResolvedValueOnce({ path: 'assets/b.png', uri: 'viking://b.png' });

    const result = await controller.uploadAssets(
      'node-1',
      [
        {
          originalname: 'a.png',
          mimetype: 'image/png',
          buffer: Buffer.from('a'),
          size: 1,
        },
        {
          originalname: 'b.png',
          mimetype: 'image/png',
          buffer: Buffer.from('b'),
          size: 1,
        },
      ],
      req,
    );

    expect(result.assets).toHaveLength(2);
    expect(documentService.uploadAsset).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document_upload_asset',
        meta: expect.objectContaining({
          paths: ['assets/a.png', 'assets/b.png'],
        }),
      }),
    );
  });

  it('上传资产为空时应该拒绝', async () => {
    await expect(controller.uploadAssets('node-1', [], req)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('读取 SVG 资产时应该强制下载并设置 nosniff', async () => {
    const stream = Readable.from(['<svg />']);
    const response = createResponse();
    documentService.loadAsset.mockResolvedValue({
      stream,
      contentType: 'image/svg+xml',
      contentLength: '7',
    });

    const result = await controller.loadAsset(
      'node-1',
      'diagram.svg',
      req,
      response,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      DOCUMENT_ASSET_NOSNIFF_HEADER,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
  });

  it('资产上传过滤器应该拒绝非法格式', () => {
    const callback = jest.fn();

    documentAssetFileFilter(
      {},
      { originalname: 'payload.exe', mimetype: 'application/x-msdownload' },
      callback,
    );

    expect(callback.mock.calls[0][0]).toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(callback.mock.calls[0][1]).toBe(false);
  });

  it('资产上传过滤器应该允许合法图片格式', () => {
    const callback = jest.fn();

    documentAssetFileFilter(
      {},
      { originalname: 'image.png', mimetype: 'image/png' },
      callback,
    );

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});

function createResponse(): Response {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}
