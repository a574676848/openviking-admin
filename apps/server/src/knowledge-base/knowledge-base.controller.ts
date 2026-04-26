import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AuditService } from '../audit/audit.service';
import { CreateKnowledgeBaseDto } from './dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-kb.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('knowledge-bases')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeBaseController {
  constructor(
    private readonly kbService: KnowledgeBaseService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.kbService.findAll(req.tenantScope);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.kbService.findOne(id, req.tenantScope);
  }

  @Post()
  async create(
    @Body() dto: CreateKnowledgeBaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = { ...dto, tenantId: req.tenantScope ?? '' };
    const created = await this.kbService.create(data);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_knowledge_base',
      target: created.id,
      meta: { name: created.name, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return created;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updated = await this.kbService.update(id, dto, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'update_knowledge_base',
      target: id,
      meta: { changes: dto, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const removed = await this.kbService.remove(id, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_knowledge_base',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return removed;
  }
}
