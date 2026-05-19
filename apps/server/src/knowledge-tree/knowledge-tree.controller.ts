import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  ForbiddenException,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { KnowledgeNodeAclService } from './knowledge-node-acl.service';
import { KnowledgeTreeService } from './knowledge-tree.service';
import { AuditService } from '../audit/audit.service';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  KNOWLEDGE_NODE_DEFAULT_KIND,
  KNOWLEDGE_NODE_KIND_DOCUMENT,
  KNOWLEDGE_TREE_DOCUMENT_FILE_EXTENSION,
  KNOWLEDGE_TREE_WRITE_ROLES,
} from './constants';
import { createAuditActorSnapshot } from '../common/audit-actor.types';

@Controller('knowledge-tree')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeTreeController {
  constructor(
    private readonly treeService: KnowledgeTreeService,
    private readonly knowledgeNodeAclService: KnowledgeNodeAclService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findByKb(
    @Query('kbId') kbId: string,
    @Query('parentId') parentId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (parentId !== undefined) {
      return this.findChildrenWithAcl(kbId, parentId, req);
    }
    return this.findByKbWithAcl(kbId, req);
  }

  @Get(':id/lineage')
  async findLineage(
    @Param('id') id: string,
    @Query('kbId') kbId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.getReadableNode(id, req);
    const items = await this.treeService.findLineageWithSiblings(
      kbId,
      id,
      req.tenantScope,
    );
    return this.knowledgeNodeAclService.filterReadableNodes(
      items,
      this.toAccessPrincipal(req),
    );
  }

  @Get('graph')
  async getGraphData(
    @Query('kbId') kbId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const items = await this.findByKbWithAcl(kbId, req);
    const itemIds = new Set(items.map((item) => item.id));
    return {
      nodes: items.map((item) => ({
        id: item.id,
        name: item.name,
        val: 1,
        kind: item.kind,
        vikingUri: item.vikingUri,
        contentUri: item.contentUri,
      })),
      links: items
        .filter((item) => item.parentId && itemIds.has(item.parentId))
        .map((item) => ({
          source: item.parentId,
          target: item.id,
          label: 'PARENT_OF',
        })),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.getReadableNode(id, req);
  }

  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(...KNOWLEDGE_TREE_WRITE_ROLES)
  async create(@Body() dto: CreateNodeDto, @Req() req: AuthenticatedRequest) {
    const { kind = KNOWLEDGE_NODE_DEFAULT_KIND, ...nodeDto } = dto;
    if (nodeDto.parentId) {
      await this.getReadableNode(nodeDto.parentId, req);
    } else {
      await this.assertKnowledgeBaseVisible(nodeDto.kbId, req);
    }
    const createPayload = {
      ...nodeDto,
      tenantId: req.tenantScope ?? '',
    };
    const actor = createAuditActorSnapshot(req.user);
    const created =
      kind === KNOWLEDGE_NODE_KIND_DOCUMENT
        ? await this.treeService.createFile(
            {
              ...createPayload,
              fileExtension: KNOWLEDGE_TREE_DOCUMENT_FILE_EXTENSION,
            },
            actor,
          )
        : await this.treeService.create(createPayload, actor);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_knowledge_node',
      target: created.id,
      meta: {
        kbId: created.kbId,
        kind: created.kind,
        name: created.name,
        requestId: req.headers['x-request-id'],
      },
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
    await this.getReadableNode(id, req);
    const updated = await this.treeService.update(
      id,
      dto,
      req.tenantScope,
      createAuditActorSnapshot(req.user),
    );
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
    await this.getReadableNode(id, req);
    const removed = await this.treeService.remove(id, req.tenantScope, {
      user: req.user.username,
    });
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
    await this.getReadableNode(id, req);
    if (body.parentId) {
      await this.getReadableNode(body.parentId, req);
    }
    const moved = await this.treeService.update(
      id,
      { parentId: body.parentId, sortOrder: body.sortOrder },
      req.tenantScope,
      createAuditActorSnapshot(req.user),
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

  private async findByKbWithAcl(kbId: string, req: AuthenticatedRequest) {
    await this.assertKnowledgeBaseVisible(kbId, req);
    const items = await this.treeService.findByKb(kbId, req.tenantScope);
    return this.knowledgeNodeAclService.filterReadableNodes(
      items,
      this.toAccessPrincipal(req),
    );
  }

  private async findChildrenWithAcl(
    kbId: string,
    parentId: string,
    req: AuthenticatedRequest,
  ) {
    if (parentId !== 'root') {
      await this.getReadableNode(parentId, req);
    } else {
      await this.assertKnowledgeBaseVisible(kbId, req);
    }
    const items = await this.treeService.findChildrenWithCount(
      kbId,
      parentId === 'root' ? null : parentId,
      req.tenantScope,
    );
    return this.knowledgeNodeAclService.filterReadableNodes(
      items,
      this.toAccessPrincipal(req),
    );
  }

  private async assertKnowledgeBaseVisible(
    kbId: string,
    req: AuthenticatedRequest,
  ) {
    const items = await this.treeService.findByKb(kbId, req.tenantScope);
    if (
      items.length > 0 &&
      this.knowledgeNodeAclService.filterReadableNodes(
        items,
        this.toAccessPrincipal(req),
      ).length === 0
    ) {
      throw new ForbiddenException('当前用户无权访问该知识库');
    }
  }

  private async getReadableNode(id: string, req: AuthenticatedRequest) {
    const node = await this.treeService.findOne(id, req.tenantScope);
    this.knowledgeNodeAclService.assertCanReadNode(
      node,
      this.toAccessPrincipal(req),
    );
    return node;
  }

  private toAccessPrincipal(req: AuthenticatedRequest) {
    return {
      userId: req.user.id,
      role: req.user.role,
    };
  }
}
