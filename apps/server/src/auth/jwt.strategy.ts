import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private authService: AuthService,
  ) {
    console.log('--- Initializing JwtStrategy ---');
    const secret = config.get<string>('JWT_SECRET')!;
    console.log('JWT Secret configured:', !!secret);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
    console.log('JwtStrategy super() called successfully');
  }

  async validate(payload: {
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
