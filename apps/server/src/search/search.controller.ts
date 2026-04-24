import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { SearchService } from './search.service';
import type { FindParams } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('find')
  find(@Body() params: FindParams, @Req() req: any) {
    return this.searchService.find(params, req.tenantScope, req.user);
  }

  @Post('grep')
  grep(@Body() body: { pattern: string; uri: string }, @Req() req: any) {
    return this.searchService.grep(body.pattern, body.uri, req.tenantScope);
  }

  @Get('analysis')
  getAnalysis(@Req() req: any) {
    return this.searchService.getAnalysis(req.tenantScope);
  }

  @Get('stats-deep')
  getStatsDeep(@Req() req: any) {
    return this.searchService.getStatsDeep(req.tenantScope);
  }

  @Get('logs')
  getRecentLogs(@Query('limit') limit: string, @Req() req: any) {
    return this.searchService.getRecentLogs(
      limit ? parseInt(limit) : 10,
      req.tenantScope,
    );
  }

  @Post('logs/:id/feedback')
  setFeedback(
    @Param('id') id: string,
    @Body() body: { feedback: string; note?: string },
  ) {
    return this.searchService.setFeedback(id, body.feedback, body.note);
  }
}
