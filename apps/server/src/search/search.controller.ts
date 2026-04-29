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
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import type { OVRequestMeta } from '../common/ov-client.service';

@Controller('search')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly auditService: AuditService,
  ) {}

  @Post('find')
  find(@Body() params: FindDto, @Req() req: AuthenticatedRequest) {
    return this.searchService.find(
      params,
      req.tenantScope ?? '',
      req.user,
      this.toTraceMeta(req),
    );
  }

  @Post('grep')
  grep(@Body() body: GrepDto, @Req() req: AuthenticatedRequest) {
    return this.searchService.grep(
      body.pattern,
      body.uri,
      req.tenantScope ?? '',
      this.toTraceMeta(req),
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
  async setFeedback(
    @Param('id') id: string,
    @Body() body: FeedbackDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updated = await this.searchService.setFeedback(
      id,
      body.feedback,
      body.note,
    );
    await this.auditService.log({
      tenantId: req.tenantScope ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'search_feedback',
      target: id,
      meta: {
        feedback: body.feedback,
        note: body.note ?? '',
        requestId: req.headers['x-request-id'],
      },
      ip: req.ip,
    });
    return updated;
  }

  private toTraceMeta(req: AuthenticatedRequest): OVRequestMeta | undefined {
    const traceId = this.readHeader(req.headers['x-trace-id']);
    const requestId = this.readHeader(req.headers['x-request-id']);
    const account =
      this.readHeader(req.headers['x-openviking-account']) ??
      req.tenantScope ??
      req.user?.tenantId ??
      undefined;
    const user =
      this.readHeader(req.headers['x-openviking-user']) ??
      req.user?.id;

    if (
      !traceId &&
      !requestId &&
      !account &&
      !user
    ) {
      return undefined;
    }

    return {
      traceId,
      requestId,
      account,
      user,
    };
  }

  private readHeader(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value.find((item) => item.trim().length > 0);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return undefined;
  }
}
