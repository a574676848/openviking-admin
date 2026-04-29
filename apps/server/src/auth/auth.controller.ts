import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  UseGuards,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { SystemRoles } from '../users/entities/user.entity';
import { IntegrationType } from '../common/constants/system.enum';
import { SSOPortalService } from './sso/sso-portal.service';
import type { Response } from 'express';
import { SsoTicketService } from './sso/sso-ticket.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SSOPortalService,
    private readonly ssoTicketService: SsoTicketService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(loginDto, req.ip ?? '');
  }

  @Get('sso/redirect/:tenantId/:type')
  ssoRedirect(
    @Param('tenantId') tenantId: string,
    @Param('type') type: IntegrationType,
    @Res() res: Response,
  ) {
    const redirectUrl = `https://open.feishu.cn/open-apis/authen/v1/index?app_id=...&redirect_uri=...`;
    return res.redirect(redirectUrl);
  }

  @Get('sso/callback/:tenantId/:type')
  async ssoCallback(
    @Param('tenantId') tenantId: string,
    @Param('type') type: IntegrationType,
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    try {
      const user = await this.ssoService.authenticate(tenantId, type, { code });
      if (!user) throw new UnauthorizedException('SSO 认证返回空用户');
      const tokenData = this.authService.generateToken(user);
      const ticket = this.ssoTicketService.create({
        accessToken: tokenData.accessToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          tenantId: user.tenantId ?? null,
        },
      });

      return res.redirect(`/login?sso_ticket=${encodeURIComponent(ticket)}`);
    } catch {
      return res.redirect(`/login?error=${encodeURIComponent('企业认证失败')}`);
    }
  }

  @Post('sso/exchange')
  exchangeSsoTicket(@Body('ticket') ticket: string) {
    return this.ssoTicketService.consume(ticket);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRoles.SUPER_ADMIN)
  @Post('switch-role')
  async switchRole(
    @Body('tenantId') tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.authService.switchRole(req.user.id, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.validateUser(req.user.id);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    return this.authService.buildSessionUserForAuthContext(user, req.user);
  }
}
