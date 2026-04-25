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
  constructor(private readonly svc: IntegrationService) {}

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
    return this.svc.mask(item);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const item = await this.svc.update(id, toUpdateInput(dto), req.tenantScope);
    return this.svc.mask(item);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.remove(id, req.tenantScope);
  }
}
