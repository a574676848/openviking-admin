import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { ImportTaskService } from './import-task.service';
import { AuditService } from '../audit/audit.service';
import { CreateImportTaskDto } from './dto/create-import-task.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

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
    const created = await this.taskService.create(dto, req.tenantScope ?? '');
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_import_task',
      target: created.id,
      meta: { sourceType: created.sourceType, requestId: req.headers['x-request-id'] },
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
}
