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
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('knowledge-tree')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeTreeController {
  constructor(private readonly treeService: KnowledgeTreeService) {}

  @Get()
  findByKb(@Query('kbId') kbId: string, @Req() req: AuthenticatedRequest) {
    return this.treeService.findByKb(kbId, req.tenantScope);
  }

  @Get('graph')
  getGraphData(@Query('kbId') kbId: string, @Req() req: AuthenticatedRequest) {
    return this.treeService.getGraphData(kbId, req.tenantScope);
  }

  @Post()
  create(@Body() dto: CreateNodeDto, @Req() req: AuthenticatedRequest) {
    return this.treeService.create({ ...dto, tenantId: req.tenantScope ?? '' });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.treeService.update(id, dto, req.tenantScope);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.treeService.remove(id, req.tenantScope);
  }

  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() body: { parentId: string | null; sortOrder: number },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.treeService.update(
      id,
      { parentId: body.parentId ?? undefined, sortOrder: body.sortOrder },
      req.tenantScope,
    );
  }
}
