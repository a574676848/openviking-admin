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
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { SystemRoles } from '../users/entities/user.entity';

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

  /** 公开接口：检测租户认证配置（无需 JWT） */
  @Get('check-auth/:code')
  async checkAuth(@Param('code') code: string) {
    const items = await this.integrationService.findAll(code);
    return {
      oidc: !!items.find((i) => i.type === 'oidc' && i.active),
      feishu: !!items.find((i) => i.type === 'feishu' && i.active),
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
  create(@Body() dto: CreateTenantDto, @Req() req: any) {
    return this.tenantService.create(dto, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: any,
  ) {
    return this.tenantService.update(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.tenantService.remove(id, req.user);
  }
}
