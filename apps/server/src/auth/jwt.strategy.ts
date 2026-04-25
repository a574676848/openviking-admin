import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private authService: AuthService,
  ) {
    const secret = config.get<string>('JWT_SECRET')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
    this.logger.log('JwtStrategy initialized');
  }

  validate(payload: {
    sub: string;
    username: string;
    role: string;
    tenantId: string | null;
    scope: string;
  }) {
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      tenantId: payload.tenantId,
      scope: payload.scope,
    };
  }
}
