import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { SystemRoles } from '../users/entities/user.entity';
import { TenantMigrationRequestDto } from './dto/tenant-migration.dto';
import { TenantMigrationService } from './tenant-migration.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRoles.SUPER_ADMIN)
@Controller('tenant-migrations')
export class TenantMigrationController {
  constructor(
    private readonly tenantMigrationService: TenantMigrationService,
  ) {}

  @Get('tenants')
  findTenants() {
    return this.tenantMigrationService.findTenants();
  }

  @Post('precheck')
  precheck(@Body() dto: TenantMigrationRequestDto) {
    return this.tenantMigrationService.precheckTenant(dto);
  }

  @Post('tasks')
  createTask(
    @Body() dto: TenantMigrationRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tenantMigrationService.createTenantTask(dto, req.user);
  }

  @Post('platform/precheck')
  precheckPlatform() {
    return this.tenantMigrationService.precheckPlatform();
  }

  @Post('platform/tasks')
  createPlatformTask(@Req() req: AuthenticatedRequest) {
    return this.tenantMigrationService.createPlatformTask(req.user);
  }

  @Get('tasks')
  findTasks() {
    return this.tenantMigrationService.findTasks();
  }

  @Get('tasks/:id')
  findTask(@Param('id') id: string) {
    return this.tenantMigrationService.findTask(id);
  }
}
