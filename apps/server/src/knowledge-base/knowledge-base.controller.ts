import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  ForbiddenException,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeNodeAclService } from '../knowledge-tree/knowledge-node-acl.service';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { AuditService } from '../audit/audit.service';
import { CreateKnowledgeBaseDto } from './dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-kb.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { createAuditActorSnapshot } from '../common/audit-actor.types';

@Controller('knowledge-bases')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(
    private readonly kbService: KnowledgeBaseService,
    private readonly knowledgeNodeAclService: KnowledgeNodeAclService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const items = await this.kbService.findAll(req.tenantScope);
    return this.filterVisibleKnowledgeBases(items, req);
  }

  @Get('paged')
  async findPaged(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    const parsedPage = Math.max(1, page ? parseInt(page, 10) : 1);
    const parsedPageSize = Math.max(
      1,
      Math.min(100, pageSize ? parseInt(pageSize, 10) : 6),
    );
    const items = await this.kbService.findAll(req.tenantScope);
    const visibleItems = await this.filterVisibleKnowledgeBases(items, req);
    const filteredItems = this.filterKnowledgeBasesByQuery(visibleItems, q);
    const total = filteredItems.length;
    const start = (parsedPage - 1) * parsedPageSize;
    return {
      items: filteredItems.slice(start, start + parsedPageSize),
      total,
      page: parsedPage,
      pageSize: parsedPageSize,
      pages: Math.max(1, Math.ceil(total / parsedPageSize)),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const kb = await this.kbService.findOne(id, req.tenantScope);
    await this.assertKnowledgeBaseVisible(id, req);
    return kb;
  }

  @Get(':id/tree')
  async findTree(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.kbService.findOne(id, req.tenantScope);
    await this.assertKnowledgeBaseVisible(id, req);
    const nodes = await this.knowledgeTreeService.findByKb(id, req.tenantScope);
    return this.knowledgeNodeAclService.filterReadableNodes(
      nodes,
      this.toAccessPrincipal(req),
    );
  }

  @Post()
  async create(
    @Body() dto: CreateKnowledgeBaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = { ...dto, tenantId: req.tenantScope ?? '' };
    const actor = createAuditActorSnapshot(req.user);
    const created = await this.kbService.create(data, actor);
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
    await this.assertKnowledgeBaseVisible(id, req);
    const updated = await this.kbService.update(
      id,
      dto,
      req.tenantScope,
      createAuditActorSnapshot(req.user),
    );
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
    await this.assertKnowledgeBaseVisible(id, req);
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

  private toAccessPrincipal(req: AuthenticatedRequest) {
    return {
      userId: req.user.id,
      role: req.user.role,
    };
  }

  private async canAccessKnowledgeBase(
    kbId: string,
    req: AuthenticatedRequest,
  ) {
    const nodes = await this.knowledgeTreeService.findByKb(
      kbId,
      req.tenantScope,
    );
    if (nodes.length === 0) {
      return true;
    }

    return (
      this.knowledgeNodeAclService.filterReadableNodes(
        nodes,
        this.toAccessPrincipal(req),
      ).length > 0
    );
  }

  private async assertKnowledgeBaseVisible(
    kbId: string,
    req: AuthenticatedRequest,
  ) {
    if (!(await this.canAccessKnowledgeBase(kbId, req))) {
      throw new ForbiddenException('当前用户无权访问该知识库');
    }
  }

  private async filterVisibleKnowledgeBases(
    items: Array<{
      id: string;
      name?: string | null;
      description?: string | null;
    }>,
    req: AuthenticatedRequest,
  ) {
    const visibleItems = await Promise.all(
      items.map(async (item) => ({
        item,
        visible: await this.canAccessKnowledgeBase(item.id, req),
      })),
    );
    return visibleItems
      .filter((entry) => entry.visible)
      .map((entry) => entry.item);
  }

  private filterKnowledgeBasesByQuery<
    T extends { name?: string | null; description?: string | null },
  >(items: T[], q?: string) {
    const keyword = q?.trim().toLowerCase();
    if (!keyword) {
      return items;
    }

    return items.filter((item) => {
      const name = item.name?.toLowerCase() ?? '';
      const description = item.description?.toLowerCase() ?? '';
      return name.includes(keyword) || description.includes(keyword);
    });
  }
}
