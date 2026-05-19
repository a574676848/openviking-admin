import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import { createAuditActorSnapshot } from '../common/audit-actor.types';
import { DocumentBlock } from './document-content-codec';
import {
  DOCUMENT_ASSET_CACHE_CONTROL,
  DOCUMENT_ASSET_NOSNIFF_HEADER,
  DOCUMENT_ASSET_UPLOAD_CONFIG,
  DOCUMENT_SVG_EXTENSION,
  DOCUMENT_SVG_MIME_TYPE,
  DOCUMENT_WRITE_ROLES,
  documentAssetFileFilter,
} from './constants';
import { DocumentService } from './document.service';
import { DocumentAssetUploadFile } from './document.service.types';

interface SaveDocumentContentBody {
  blocks?: DocumentBlock[];
}

const DOCUMENT_ASSET_ETAG_ALGORITHM = 'sha256';
const DOCUMENT_ASSET_DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const DOCUMENT_ASSET_DOWNLOAD_DISPOSITION = 'attachment';

@Controller('editor')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly auditService: AuditService,
  ) {}

  @Get(':nodeId')
  getMetadata(
    @Param('nodeId') nodeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentService.getMetadata(
      nodeId,
      req.tenantScope,
      req.user.role,
      this.toAccessContext(req),
    );
  }

  @Get(':nodeId/content')
  loadContent(
    @Param('nodeId') nodeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentService.loadContent(
      nodeId,
      req.tenantScope,
      this.toAccessContext(req),
    );
  }

  @Put(':nodeId/content')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(...DOCUMENT_WRITE_ROLES)
  async saveContent(
    @Param('nodeId') nodeId: string,
    @Body() body: SaveDocumentContentBody,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.documentService.saveContent(
      nodeId,
      req.tenantScope,
      this.resolveBlocks(body),
      { assertNoActiveWriteSession: true },
      createAuditActorSnapshot(req.user),
      this.toAccessContext(req),
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'document_save_content',
      target: nodeId,
      meta: {
        contentUri: result.contentUri,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return result;
  }

  @Get(':nodeId/index')
  getIndexStatus(
    @Param('nodeId') nodeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentService.getMetadata(
      nodeId,
      req.tenantScope,
      req.user.role,
      this.toAccessContext(req),
    );
  }

  @Post(':nodeId/index')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(...DOCUMENT_WRITE_ROLES)
  async indexContent(
    @Param('nodeId') nodeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.documentService.indexContent(
      nodeId,
      req.tenantScope,
      createAuditActorSnapshot(req.user),
      this.toAccessContext(req),
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'document_index_content',
      target: nodeId,
      meta: {
        contentUri: result.contentUri,
        draftVersion: result.draftVersion,
        indexedVersion: result.indexedVersion,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return result;
  }

  @Post(':nodeId/assets')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(...DOCUMENT_WRITE_ROLES)
  @UseInterceptors(
    FilesInterceptor(
      DOCUMENT_ASSET_UPLOAD_CONFIG.FIELD_NAME,
      DOCUMENT_ASSET_UPLOAD_CONFIG.MAX_FILES,
      {
        fileFilter: documentAssetFileFilter,
        limits: {
          files: DOCUMENT_ASSET_UPLOAD_CONFIG.MAX_FILES,
          fileSize: DOCUMENT_ASSET_UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES,
        },
      },
    ),
  )
  async uploadAssets(
    @Param('nodeId') nodeId: string,
    @UploadedFiles() files: DocumentAssetUploadFile[] | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const uploadFiles = files ?? [];
    if (uploadFiles.length === 0) {
      throw new BadRequestException('至少上传一个图片文件。');
    }

    const assets = await Promise.all(
      uploadFiles.map((file) =>
        this.documentService.uploadAsset(
          nodeId,
          req.tenantScope,
          file,
          createAuditActorSnapshot(req.user),
          this.toAccessContext(req),
        ),
      ),
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'document_upload_asset',
      target: nodeId,
      meta: {
        paths: assets.map((asset) => asset.path),
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });

    return { assets };
  }

  @Get(':nodeId/assets/*path')
  async loadAsset(
    @Param('nodeId') nodeId: string,
    @Param('path') rawPath: string | string[] | undefined,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const assetPath = this.resolveAssetPath(rawPath);
    const asset = await this.documentService.loadAsset(
      nodeId,
      req.tenantScope,
      assetPath,
      this.toAccessContext(req),
    );
    const contentType =
      asset.contentType ?? DOCUMENT_ASSET_DEFAULT_CONTENT_TYPE;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', DOCUMENT_ASSET_CACHE_CONTROL);
    res.setHeader(
      'ETag',
      this.createAssetEtag(nodeId, assetPath, asset.contentLength),
    );
    if (asset.contentLength) {
      res.setHeader('Content-Length', asset.contentLength);
    }
    if (this.isSvgAsset(assetPath, contentType)) {
      res.setHeader(
        'Content-Disposition',
        this.createAttachmentDisposition(assetPath),
      );
      res.setHeader('X-Content-Type-Options', DOCUMENT_ASSET_NOSNIFF_HEADER);
    }

    return new StreamableFile(asset.stream);
  }

  private resolveBlocks(body: SaveDocumentContentBody): DocumentBlock[] {
    if (!body || !Array.isArray(body.blocks)) {
      throw new BadRequestException('文档内容必须包含 blocks 数组。');
    }

    return body.blocks;
  }

  private resolveAssetPath(rawPath: string | string[] | undefined): string {
    const assetPath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
    if (!assetPath || assetPath.includes('..')) {
      throw new BadRequestException('资产路径无效。');
    }

    return assetPath;
  }

  private createAssetEtag(
    nodeId: string,
    assetPath: string,
    contentLength?: string,
  ): string {
    const hash = createHash(DOCUMENT_ASSET_ETAG_ALGORITHM)
      .update(`${nodeId}:${assetPath}:${contentLength ?? ''}`)
      .digest('hex');

    return `W/"${hash}"`;
  }

  private isSvgAsset(assetPath: string, contentType: string): boolean {
    return (
      contentType.toLowerCase().includes(DOCUMENT_SVG_MIME_TYPE) ||
      extname(assetPath).toLowerCase() === DOCUMENT_SVG_EXTENSION
    );
  }

  private createAttachmentDisposition(assetPath: string): string {
    const fileName = assetPath.split('/').at(-1) ?? 'asset.svg';
    return `${DOCUMENT_ASSET_DOWNLOAD_DISPOSITION}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  private toAccessContext(req: AuthenticatedRequest) {
    return {
      userId: req.user.id,
      role: req.user.role,
    };
  }
}
