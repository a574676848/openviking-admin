import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { Roles } from '../common/roles.decorator';
import { ImportTaskService } from './import-task.service';
import { CreateImportTaskDto } from './dto/create-import-task.dto';

@Controller('import-tasks')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ImportTaskController {
  constructor(private readonly taskService: ImportTaskService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.taskService.findAll(req.tenantScope);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.taskService.findOne(id, req.tenantScope);
  }

  @Post()
  create(@Body() dto: CreateImportTaskDto, @Req() req: any) {
    return this.taskService.create(dto, req.tenantScope);
  }

  @Get(':id/sync')
  syncResult(@Param('id') id: string, @Req() req: any) {
    return this.taskService.syncResult(id, req.tenantScope);
  }
}
