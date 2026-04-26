import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { AuditService } from '../audit/audit.service';
import { IntegrationService } from './integration.service';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
} from './dto/integration.dto';
import type {
  CreateIntegrationInput,
  UpdateIntegrationInput,
} from './domain/integration-input.model';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

function toCreateInput(dto: CreateIntegrationDto): CreateIntegrationInput {
  return {
    name: dto.name,
    type: dto.type,
    credentials: dto.credentials,
  };
}

function toUpdateInput(dto: UpdateIntegrationDto): UpdateIntegrationInput {
  return {
    name: dto.name,
    type: dto.type,
    credentials: dto.credentials,
    active: dto.active,
  };
}

@Controller('integrations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class IntegrationController {
  constructor(
    private readonly svc: IntegrationService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const items = await this.svc.findAll(req.tenantScope);
    return items.map((i) => this.svc.mask(i));
  }

  @Post()
  async create(
    @Body() dto: CreateIntegrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const item = await this.svc.create(
      toCreateInput(dto),
      req.tenantScope ?? '',
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_integration',
      target: item.id,
      meta: { type: item.type, name: item.name, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return this.svc.mask(item);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const item = await this.svc.update(id, toUpdateInput(dto), req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'update_integration',
      target: id,
      meta: { changes: dto, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return this.svc.mask(item);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const removed = await this.svc.remove(id, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_integration',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return removed;
  }
}
