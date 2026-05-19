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
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { SystemRoles } from '../users/entities/user.entity';
import { IntegrationType } from '../common/constants/system.enum';
import { SSOPortalService } from './sso/sso-portal.service';
import type { Request, Response } from 'express';
import { SsoTicketService } from './sso/sso-ticket.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

const SSO_CLIENT_REDIRECT_PARAM = 'redirect';
const SSO_TICKET_QUERY_PARAM = 'sso_ticket';
const SSO_ERROR_QUERY_PARAM = 'error';
const SSO_STATE_CLIENT_REDIRECT_KEY = 'clientRedirectUri';
const SSO_ERROR_MESSAGE = '企业认证失败';
const DEFAULT_FRONTEND_URL = 'http://localhost:6002';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SSOPortalService,
    private readonly ssoTicketService: SsoTicketService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(loginDto, req.ip ?? '');
  }

  @Get('sso/redirect/:tenantId/:type')
  ssoRedirect(
    @Param('tenantId') tenantId: string,
    @Param('type') type: IntegrationType,
    @Query(SSO_CLIENT_REDIRECT_PARAM) clientRedirectUri: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.redirectToEnterpriseSso(
      tenantId,
      type,
      clientRedirectUri,
      req,
      res,
    );
  }

  private async redirectToEnterpriseSso(
    tenantId: string,
    type: IntegrationType,
    clientRedirectUri: string | undefined,
    req: Request,
    res: Response,
  ) {
    const callbackUrl = this.buildSsoCallbackUrl(req, tenantId, type);
    const redirectUrl = await this.ssoService.createAuthorizationUrl({
      tenantId,
      type,
      callbackUrl,
      state: this.createSsoState(clientRedirectUri),
    });
    return res.redirect(redirectUrl);
  }

  @Get('sso/authorize')
  ssoAuthorizePage(
    @Query(SSO_CLIENT_REDIRECT_PARAM) clientRedirectUri: string | undefined,
    @Query('tenantCode') tenantCode: string | undefined,
    @Res() res: Response,
  ) {
    const safeRedirect = clientRedirectUri
      ? this.createSsoState(clientRedirectUri)
      : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>OpenViking Admin 授权登录</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
    form{width:360px;background:#111827;border:1px solid #334155;border-radius:8px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
    h1{font-size:20px;margin:0 0 20px}
    label{display:block;font-size:12px;color:#94a3b8;margin:14px 0 6px}
    input{box-sizing:border-box;width:100%;border:1px solid #475569;background:#020617;color:#e5e7eb;border-radius:6px;padding:12px}
    button{width:100%;margin-top:22px;border:0;border-radius:6px;padding:12px;background:#38bdf8;color:#082f49;font-weight:700;cursor:pointer}
  </style>
</head>
<body>
  <form method="post" action="/api/v1/auth/sso/authorize">
    <h1>OpenViking Admin 授权登录</h1>
    <input type="hidden" name="state" value="${this.escapeHtml(safeRedirect ?? '')}" />
    <label>租户标识</label>
    <input name="tenantCode" value="${this.escapeHtml(tenantCode ?? '')}" required />
    <label>账号</label>
    <input name="username" autocomplete="username" required />
    <label>密码</label>
    <input name="password" type="password" autocomplete="current-password" required />
    <button type="submit">授权 CLI / MCP</button>
  </form>
</body>
</html>`);
  }

  @Post('sso/authorize')
  async ssoAuthorizeSubmit(
    @Body()
    body: {
      username?: string;
      password?: string;
      tenantCode?: string;
      state?: string;
    },
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    try {
      const tokenData = await this.authService.login(
        {
          username: body.username ?? '',
          password: body.password ?? '',
          tenantCode: body.tenantCode ?? '',
        },
        req.ip ?? '',
      );
      const ticket = this.ssoTicketService.create({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresInSeconds: tokenData.expiresInSeconds,
        refreshExpiresInSeconds: tokenData.refreshExpiresInSeconds,
        user: tokenData.user,
      });
      return res.redirect(this.resolveSsoSuccessRedirect(body.state, ticket));
    } catch {
      return res.redirect(this.resolveSsoErrorRedirect(body.state));
    }
  }

  @Get('sso/callback/:tenantId/:type')
  async ssoCallback(
    @Param('tenantId') tenantId: string,
    @Param('type') type: IntegrationType,
    @Query('code') code: string,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const user = await this.ssoService.authenticate(tenantId, type, {
        code,
        redirectUri: this.buildSsoCallbackUrl(req, tenantId, type),
      });
      if (!user) throw new UnauthorizedException('SSO 认证返回空用户');
      const tokenData = this.authService.generateToken(user);
      const ticket = this.ssoTicketService.create({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresInSeconds: tokenData.expiresInSeconds,
        refreshExpiresInSeconds: tokenData.refreshExpiresInSeconds,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          tenantId: user.tenantId ?? null,
        },
      });

      return res.redirect(this.resolveSsoSuccessRedirect(state, ticket));
    } catch {
      return res.redirect(this.resolveSsoErrorRedirect(state));
    }
  }

  @Post('sso/exchange')
  exchangeSsoTicket(@Body('ticket') ticket: string) {
    return this.ssoTicketService.consume(ticket);
  }

  @Post('sso/ldap/:tenantId')
  async ldapLogin(
    @Param('tenantId') tenantId: string,
    @Body() body: { username?: string; password?: string },
  ) {
    const user = await this.ssoService.authenticate(
      tenantId,
      IntegrationType.LDAP,
      {
        username: body.username,
        password: body.password,
      },
    );
    return this.authService.generateToken(user);
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

  private buildSsoCallbackUrl(
    req: Request,
    tenantId: string,
    type: IntegrationType,
  ) {
    const protocol = String(req.headers['x-forwarded-proto'] ?? req.protocol)
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host);
    return `${protocol}://${host}/api/v1/auth/sso/callback/${encodeURIComponent(tenantId)}/${type}`;
  }

  private createSsoState(clientRedirectUri: string | undefined) {
    if (!clientRedirectUri) {
      return undefined;
    }

    const parsed = new URL(clientRedirectUri);
    if (!this.isAllowedClientRedirect(parsed)) {
      throw new BadRequestException('OAuth 回调地址只允许 localhost');
    }

    return Buffer.from(
      JSON.stringify({
        [SSO_STATE_CLIENT_REDIRECT_KEY]: parsed.toString(),
      }),
      'utf8',
    ).toString('base64url');
  }

  private resolveSsoSuccessRedirect(state: string | undefined, ticket: string) {
    const clientRedirectUri = this.readClientRedirectUri(state);
    if (clientRedirectUri) {
      const url = new URL(clientRedirectUri);
      url.searchParams.set(SSO_TICKET_QUERY_PARAM, ticket);
      return url.toString();
    }

    const url = new URL('/login', this.getFrontendUrl());
    url.searchParams.set(SSO_TICKET_QUERY_PARAM, ticket);
    return url.toString();
  }

  private resolveSsoErrorRedirect(state: string | undefined) {
    const clientRedirectUri = this.readClientRedirectUri(state);
    if (clientRedirectUri) {
      const url = new URL(clientRedirectUri);
      url.searchParams.set(SSO_ERROR_QUERY_PARAM, SSO_ERROR_MESSAGE);
      return url.toString();
    }

    const url = new URL('/login', this.getFrontendUrl());
    url.searchParams.set(SSO_ERROR_QUERY_PARAM, SSO_ERROR_MESSAGE);
    return url.toString();
  }

  private readClientRedirectUri(state: string | undefined) {
    if (!state) {
      return null;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const value = payload[SSO_STATE_CLIENT_REDIRECT_KEY];
      if (typeof value !== 'string') {
        return null;
      }
      const parsed = new URL(value);
      return this.isAllowedClientRedirect(parsed) ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  private isAllowedClientRedirect(url: URL) {
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    );
  }

  private getFrontendUrl() {
    return this.configService.get<string>('FRONTEND_URL') ?? DEFAULT_FRONTEND_URL;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
