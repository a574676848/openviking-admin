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
import { IntegrationService } from './integration.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class IntegrationController {
  constructor(private readonly svc: IntegrationService) {}

  @Get()
  async findAll(@Req() req: any) {
    const items = await this.svc.findAll(req.tenantScope);
    return items.map((i) => this.svc.mask(i));
  }

  @Post()
  async create(@Body() dto: any, @Req() req: any) {
    const item = await this.svc.create(dto, req.tenantScope);
    return this.svc.mask(item);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const item = await this.svc.update(id, dto, req.tenantScope);
    return this.svc.mask(item);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, req.tenantScope);
  }
}
