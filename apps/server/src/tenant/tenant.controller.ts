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
import { TenantService } from './tenant.service';
import { IntegrationService } from './integration.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  UpdateTenantStatusDto,
} from './dto/tenant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { SystemRoles } from '../users/entities/user.entity';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly integrationService: IntegrationService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Get()
  findAll() {
    return this.tenantService.findAll();
  }

  @Get('check-auth/:code')
  async checkAuth(@Param('code') code: string) {
    const items = await this.integrationService.findAll(code);
    return {
      oidc: items.some((i) => (i.type as string) === 'oidc' && i.active),
      feishu: items.some((i) => (i.type as string) === 'feishu' && i.active),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateTenantDto, @Req() req: AuthenticatedRequest) {
    return this.tenantService.create(dto, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tenantService.update(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tenantService.updateStatus(id, dto.status, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.tenantService.remove(id, req.user);
  }
}
