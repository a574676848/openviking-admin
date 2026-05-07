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
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { SystemRoles } from './entities/user.entity';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  findAll(@Req() req: AuthenticatedRequest) {
    return this.usersService.findAll(req.tenantScope);
  }

  @Post()
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  async create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    if (
      req.user.role !== SystemRoles.SUPER_ADMIN &&
      dto.role === SystemRoles.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权创建超级管理员账号');
    }

    const data = req.tenantScope
      ? { ...dto, tenantId: req.tenantScope }
      : dto;
    const created = await this.usersService.create(data);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_user',
      target: created.id,
      meta: { role: created.role, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return created;
  }

  @Patch(':id')
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (
      req.user.role !== SystemRoles.SUPER_ADMIN &&
      dto.role === SystemRoles.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权将用户提升为超级管理员');
    }
    const updated = await this.usersService.update(id, dto, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'update_user',
      target: id,
      meta: { changes: dto, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const removed = await this.usersService.remove(id, req.tenantScope);
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_user',
      target: id,
      meta: { role: removed.role, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return removed;
  }
}
