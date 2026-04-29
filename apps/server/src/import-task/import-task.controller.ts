import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { ImportTaskService } from './import-task.service';
import { AuditService } from '../audit/audit.service';
import { CreateImportTaskDto } from './dto/create-import-task.dto';
import { CreateLocalImportTaskDto } from './dto/create-local-import-task.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { LOCAL_IMPORT_UPLOAD_CONFIG } from './constants';
import type { LocalImportUploadFile } from './local-import-storage.service';

@Controller('import-tasks')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ImportTaskController {
  constructor(
    private readonly taskService: ImportTaskService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.taskService.findAll(req.tenantScope);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.taskService.findOne(id, req.tenantScope);
  }

  @Post()
  async create(
    @Body() dto: CreateImportTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const created = await this.createAndAudit(dto, req, 'create_import_task');
    return created;
  }

  @Post('documents')
  async createDocumentImport(
    @Body() dto: CreateImportTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const created = await this.createAndAudit(
      dto,
      req,
      'create_document_import_task',
    );
    return {
      taskId: created.id,
      status: created.status,
      item: created,
    };
  }

  @Get(':id/events')
  async events(
    @Param('id') id: string,
    @Query('sync') sync: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const task = sync === 'true'
      ? await this.taskService.syncResult(id, req.tenantScope)
      : await this.taskService.findOne(id, req.tenantScope);
    return {
      events: [
        {
          taskId: task?.id ?? id,
          status: task?.status ?? 'unknown',
          progress: this.toProgress(task?.status),
          message: task?.errorMsg ?? this.toStatusMessage(task?.status),
          updatedAt: task?.updatedAt ?? new Date(),
        },
      ],
    };
  }

  @Post('local-upload')
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
  async createLocalUpload(
    @UploadedFiles() files: LocalImportUploadFile[],
    @Body() dto: CreateLocalImportTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const created = await this.taskService.createLocalUpload(
      dto,
      files ?? [],
      req.tenantScope ?? '',
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_local_import_task',
      target: created.id,
      meta: {
        sourceType: created.sourceType,
        fileCount: files?.length ?? 0,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return created;
  }

  @Get(':id/sync')
  syncResult(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.taskService.syncResult(id, req.tenantScope);
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const retried = await this.taskService.retry(id, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'retry_import_task',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return retried;
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const cancelled = await this.taskService.cancel(id, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'cancel_import_task',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return cancelled;
  }

  private async createAndAudit(
    dto: CreateImportTaskDto,
    req: AuthenticatedRequest,
    action: string,
  ) {
    const created = await this.taskService.create(dto, req.tenantScope ?? '');
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action,
      target: created.id,
      meta: {
        sourceType: created.sourceType,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return created;
  }

  private toProgress(status: string | undefined) {
    if (status === 'completed') return 100;
    if (status === 'running') return 50;
    if (status === 'failed' || status === 'cancelled') return 0;
    return 10;
  }

  private toStatusMessage(status: string | undefined) {
    if (status === 'completed') return '导入完成';
    if (status === 'running') return '正在导入';
    if (status === 'failed') return '导入失败';
    if (status === 'cancelled') return '导入已取消';
    return '等待导入';
  }
}
