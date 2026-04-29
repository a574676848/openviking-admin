import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCapabilityKeyDto } from './dto/capability-key.dto';
import { CapabilityKeyService } from './capability-key.service';

@Controller('capability/keys')
@UseGuards(JwtAuthGuard)
export class CapabilityKeyController {
  constructor(
    private readonly capabilityKeyService: CapabilityKeyService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  async createCapabilityKey(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCapabilityKeyDto,
  ) {
    const tenantId = this.resolveTenantId(req);
    const created = await this.capabilityKeyService.createCapabilityKey(
      dto.userId,
      tenantId,
      dto.name,
      dto.ttlSeconds,
    );
    await this.auditService.log({
      tenantId,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_capability_key',
      target: created.id,
      meta: {
        userId: dto.userId,
        name: created.name,
        ttlSeconds: dto.ttlSeconds ?? null,
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return created;
  }

  @Get()
  getCapabilityKeys(@Req() req: AuthenticatedRequest) {
    return this.capabilityKeyService.getCapabilityKeysByTenant(
      this.resolveTenantId(req),
    );
  }

  @Delete(':id')
  async deleteCapabilityKey(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const tenantId = this.resolveTenantId(req);
    const result = await this.capabilityKeyService.deleteCapabilityKey(
      id,
      tenantId,
    );
    await this.auditService.log({
      tenantId,
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_capability_key',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return result;
  }

  private resolveTenantId(req: AuthenticatedRequest) {
    if (!req.user.tenantId) {
      throw new ForbiddenException('当前用户未绑定租户上下文');
    }
    return req.user.tenantId;
  }
}
