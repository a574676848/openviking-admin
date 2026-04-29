import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { KnowledgeTreeService } from './knowledge-tree.service';
import { AuditService } from '../audit/audit.service';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('knowledge-tree')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeTreeController {
  constructor(
    private readonly treeService: KnowledgeTreeService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findByKb(@Query('kbId') kbId: string, @Req() req: AuthenticatedRequest) {
    return this.treeService.findByKb(kbId, req.tenantScope);
  }

  @Get('graph')
  getGraphData(@Query('kbId') kbId: string, @Req() req: AuthenticatedRequest) {
    return this.treeService.getGraphData(kbId, req.tenantScope);
  }

  @Post()
  async create(@Body() dto: CreateNodeDto, @Req() req: AuthenticatedRequest) {
    const created = await this.treeService.create({
      ...dto,
      tenantId: req.tenantScope ?? '',
    });
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_knowledge_node',
      target: created.id,
      meta: { kbId: created.kbId, name: created.name, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return created;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updated = await this.treeService.update(id, dto, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'update_knowledge_node',
      target: id,
      meta: { changes: dto, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const removed = await this.treeService.remove(id, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_knowledge_node',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return removed;
  }

  @Patch(':id/move')
  async move(
    @Param('id') id: string,
    @Body() body: { parentId: string | null; sortOrder: number },
    @Req() req: AuthenticatedRequest,
  ) {
    const moved = await this.treeService.update(
      id,
      { parentId: body.parentId, sortOrder: body.sortOrder },
      req.tenantScope,
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'move_knowledge_node',
      target: id,
      meta: {
        parentId: body.parentId ?? null,
        sortOrder: body.sortOrder,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return moved;
  }
}
