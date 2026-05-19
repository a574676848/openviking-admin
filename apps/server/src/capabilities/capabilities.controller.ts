import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
  UploadedFiles,
  UnauthorizedException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CapabilityDiscoveryService } from './application/capability-discovery.service';
import { CapabilityExecutionService } from './application/capability-execution.service';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { CapabilityAuthorizationService } from './application/capability-authorization.service';
import { getCapabilityRegistryEntry } from './application/capability-registry';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';
import { CapabilityId, ClientType, Principal } from './domain/capability.types';
import { ensureRequestTrace } from '../common/request-trace';
import { ImportTaskService } from '../import-task/import-task.service';
import { AuditService } from '../audit/audit.service';
import { CreateLocalImportTaskDto } from '../import-task/dto/create-local-import-task.dto';
import { LOCAL_IMPORT_UPLOAD_CONFIG } from '../import-task/constants';
import type { LocalImportUploadFile } from '../import-task/local-import-storage.service';
import { createAuditActorSnapshot } from '../common/audit-actor.types';

@Controller()
export class CapabilitiesController {
  constructor(
    private readonly capabilityDiscoveryService: CapabilityDiscoveryService,
    private readonly capabilityExecutionService: CapabilityExecutionService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityAuthorizationService: CapabilityAuthorizationService,
    private readonly capabilityCredentialService: CapabilityCredentialService,
    private readonly importTaskService: ImportTaskService,
    private readonly auditService: AuditService,
  ) {}

  @Get('capabilities')
  listCapabilities(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
    const capabilities = this.capabilityDiscoveryService.listCapabilities();
    return {
      data: capabilities,
      meta: {
        channel: 'http',
        count: capabilities.length,
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @Post('knowledge/search')
  async search(
    @Body() body: Record<string, unknown>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledge.search',
      body,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('knowledge/grep')
  async grep(
    @Body() body: Record<string, unknown>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledge.grep',
      body,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('resources')
  async listResources(
    @Query() query: Record<string, string>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'resources.list',
      query,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('resources/tree')
  async treeResources(
    @Query() query: Record<string, string>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'resources.tree',
      this.normalizeNumericQuery(query, ['depth']),
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/knowledge-bases')
  async listKnowledgeBases(
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledgeBases.list',
      {},
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/knowledge-bases/:id')
  async getKnowledgeBaseDetail(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledgeBases.detail',
      { id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Delete('capability/knowledge-bases/:id')
  async deleteKnowledgeBase(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledgeBases.delete',
      { id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/knowledge-bases/:id/tree')
  async listKnowledgeTree(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledgeTree.list',
      { kbId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/knowledge-tree/:id')
  async getKnowledgeTreeDetail(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledgeTree.detail',
      { id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Delete('capability/knowledge-tree/:id')
  async deleteKnowledgeTree(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledgeTree.delete',
      { id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('capability/import-tasks/documents')
  async createDocumentImport(
    @Body() body: Record<string, unknown>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.import.create',
      body,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('capability/import-tasks/local-upload')
  @UseInterceptors(
    FilesInterceptor(
      LOCAL_IMPORT_UPLOAD_CONFIG.FIELD_NAME,
      LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILES,
      {
        limits: {
          files: LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILES,
          fileSize: LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES,
        },
      },
    ),
  )
  async createLocalDocumentImport(
    @UploadedFiles() files: LocalImportUploadFile[],
    @Body() body: CreateLocalImportTaskDto,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    ensureRequestTrace(req, res);
    const principal = await this.resolvePrincipal(
      capabilityKey,
      authorization,
      this.resolveClientType('http'),
    );
    this.capabilityAuthorizationService.authorize(
      getCapabilityRegistryEntry('documents.import.create').contract,
      principal,
    );
    const created = await this.importTaskService.createLocalUpload(
      body,
      files ?? [],
      principal.tenantId ?? '',
      createAuditActorSnapshot(principal),
      { userId: principal.userId, role: principal.role ?? null },
    );
    await this.auditService.log({
      tenantId: principal.tenantId ?? undefined,
      userId: principal.userId,
      username: principal.username,
      action: 'create_local_import_task',
      target: created.id,
      meta: {
        sourceType: created.sourceType,
        fileCount: files?.length ?? 0,
        credentialType: principal.credentialType,
        clientType: principal.clientType,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });

    return created;
  }

  @Get('capability/import-tasks/:id')
  async getDocumentImportStatus(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.import.status',
      { taskId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/import-tasks')
  async listDocumentImports(
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.import.list',
      {},
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('capability/import-tasks/:id/cancel')
  async cancelDocumentImport(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.import.cancel',
      { taskId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('capability/import-tasks/:id/retry')
  async retryDocumentImport(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.import.retry',
      { taskId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/import-tasks/:id/events')
  async watchDocumentImportEvents(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.import.events',
      { taskId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('capability/documents/:id/index')
  async getDocumentIndexStatus(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.index.status',
      { nodeId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('capability/documents/:id/index/rebuild')
  async rebuildDocumentIndex(
    @Param('id') id: string,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.index.rebuild',
      { nodeId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('capability/documents/:id/draft/grep')
  async grepDocumentDraft(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'documents.draft.grep',
      { ...body, nodeId: id },
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  private async executeCapability(
    capabilityId: CapabilityId,
    input: Record<string, unknown>,
    clientType: ClientType,
    req: Request,
    res: Response,
    capabilityKey?: string,
    authorization?: string,
  ) {
    ensureRequestTrace(req, res);
    const principal = await this.resolvePrincipal(
      capabilityKey,
      authorization,
      clientType,
    );
    const trace = this.capabilityObservabilityService.createTraceContext({
      capability: capabilityId,
      principal,
      channel: 'http',
      requestId: req.header('x-request-id') ?? undefined,
    });
    const result = await this.capabilityExecutionService.execute(
      capabilityId,
      input,
      {
        principal,
        trace,
      },
    );

    res.setHeader('x-trace-id', result.traceId);
    res.setHeader('x-request-id', trace.requestId);
    return result;
  }

  private async resolvePrincipal(
    capabilityKey: string | undefined,
    authorization: string | undefined,
    clientType: ClientType,
  ): Promise<Principal> {
    if (capabilityKey) {
      return this.capabilityCredentialService.resolvePrincipalFromApiKey(
        capabilityKey,
        clientType,
      );
    }

    if (authorization?.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length).trim();
      if (bearer.startsWith('ov-sk-')) {
        return this.capabilityCredentialService.resolvePrincipalFromApiKey(
          bearer,
          clientType,
        );
      }

      return this.capabilityCredentialService.resolvePrincipalFromJwt(
        bearer,
        clientType,
      );
    }

    throw new UnauthorizedException('缺少 capability 调用凭证');
  }

  private resolveClientType(channel: 'http'): ClientType {
    return channel === 'http' ? 'service' : 'human';
  }

  private normalizeNumericQuery(
    query: Record<string, string>,
    numericKeys: string[],
  ) {
    const normalized: Record<string, unknown> = { ...query };

    for (const key of numericKeys) {
      if (query[key] !== undefined) {
        normalized[key] = Number(query[key]);
      }
    }

    return normalized;
  }
}
