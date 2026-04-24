import { Module, OnModuleInit } from '@nestjs/common';
import * as passport from 'passport';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SSOPortalService } from './sso/sso-portal.service';
import { LdapProvider } from './sso/providers/ldap.provider';
import { FeishuSsoProvider } from './sso/providers/feishu-sso.provider';
import { OidcSsoProvider } from './sso/providers/oidc-sso.provider';
import { DingTalkSsoProvider } from './sso/providers/dingtalk-sso.provider';
import { SsoTicketService } from './sso/sso-ticket.service';
import { UsersModule } from '../users/users.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Tenant]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: '2h' },
      }),
    }),
    UsersModule,
    TenantModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SSOPortalService,
    LdapProvider,
    FeishuSsoProvider,
    OidcSsoProvider,
    DingTalkSsoProvider,
    SsoTicketService,
  ],
  exports: [AuthService, SSOPortalService],
})
export class AuthModule implements OnModuleInit {
  constructor(private jwtStrategy: JwtStrategy) {}

  onModuleInit() {
    console.log('--- Passport Strategy Debug ---');
    console.log(
      'Registered Strategies Keys:',
      Object.keys((passport as any)._strategies || {}),
    );
    console.log('-------------------------------');
  }
}
