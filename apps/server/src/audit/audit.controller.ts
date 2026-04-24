import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { Roles } from '../common/roles.decorator';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('username') username?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.svc.findAll(req.tenantScope, {
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 50,
      action,
      username,
      dateFrom,
      dateTo,
    });
  }

  @Get('stats')
  stats(@Req() req: any) {
    return this.svc.getActionStats(req.tenantScope);
  }
}
