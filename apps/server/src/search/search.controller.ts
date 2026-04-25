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
import { FindDto, GrepDto, FeedbackDto } from './dto/search.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('search')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('find')
  find(@Body() params: FindDto, @Req() req: AuthenticatedRequest) {
    return this.searchService.find(params, req.tenantScope ?? '', req.user);
  }

  @Post('grep')
  grep(@Body() body: GrepDto, @Req() req: AuthenticatedRequest) {
    return this.searchService.grep(
      body.pattern,
      body.uri,
      req.tenantScope ?? '',
    );
  }

  @Get('analysis')
  getAnalysis(@Req() req: AuthenticatedRequest) {
    return this.searchService.getAnalysis(req.tenantScope);
  }

  @Get('stats-deep')
  getStatsDeep(@Req() req: AuthenticatedRequest) {
    return this.searchService.getStatsDeep(req.tenantScope);
  }

  @Get('logs')
  getRecentLogs(
    @Query('limit') limit: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.searchService.getRecentLogs(
      limit ? parseInt(limit) : 10,
      req.tenantScope,
    );
  }

  @Post('logs/:id/feedback')
  setFeedback(@Param('id') id: string, @Body() body: FeedbackDto) {
    return this.searchService.setFeedback(id, body.feedback, body.note);
  }
}
