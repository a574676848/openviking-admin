import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { SettingsService } from './settings.service';
import { RolesGuard } from '../common/roles.guard';
import { SystemRoles } from '../users/entities/user.entity';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Patch()
  @Roles(SystemRoles.SUPER_ADMIN)
  batchSet(
    @Body() body: Record<string, string>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.batchSet(body, req.user);
  }
}
