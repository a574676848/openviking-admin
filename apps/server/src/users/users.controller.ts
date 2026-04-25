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
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  findAll(@Req() req: AuthenticatedRequest) {
    return this.usersService.findAll(req.tenantScope);
  }

  @Post()
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    if (
      req.user.role !== SystemRoles.SUPER_ADMIN &&
      dto.role === SystemRoles.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权创建超级管理员账号');
    }

    const data = { ...dto, tenantId: req.tenantScope ?? '' };
    return this.usersService.create(data);
  }

  @Patch(':id')
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  update(
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
    return this.usersService.update(id, dto, req.tenantScope);
  }

  @Delete(':id')
  @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.remove(id, req.tenantScope);
  }
}
