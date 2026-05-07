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
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { AuditService } from '../audit/audit.service';
import { CreateKnowledgeBaseDto } from './dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-kb.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('knowledge-bases')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(
    private readonly kbService: KnowledgeBaseService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.kbService.findAllWithRuntimeStats(req.tenantScope);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.kbService.findOneWithRuntimeStats(id, req.tenantScope);
  }

  @Get(':id/tree')
  async findTree(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.kbService.findOne(id, req.tenantScope);
    return this.knowledgeTreeService.findByKb(id, req.tenantScope);
  }

  @Post()
  async create(
    @Body() dto: CreateKnowledgeBaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = { ...dto, tenantId: req.tenantScope ?? '' };
    const created = await this.kbService.create(data);
    try {
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
    } catch (error) {
      try {
        await this.kbService.remove(created.id, req.tenantScope, {
          user: req.user.username,
        });
      } catch (rollbackError) {
        const message =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        this.logger.error(`知识库创建后审计失败，且补偿删除失败：${message}`);
      }

      throw error;
    }
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
    const removed = await this.kbService.remove(id, req.tenantScope, {
      user: req.user.username,
    });
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
