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
import { CreateKnowledgeBaseDto } from './dto/create-kb.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-kb.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('knowledge-bases')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.kbService.findAll(req.tenantScope);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.kbService.findOne(id, req.tenantScope);
  }

  @Post()
  create(
    @Body() dto: CreateKnowledgeBaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = { ...dto, tenantId: req.tenantScope ?? '' };
    return this.kbService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.kbService.update(id, dto, req.tenantScope);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.kbService.remove(id, req.tenantScope);
  }
}
