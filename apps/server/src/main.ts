import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { assertSafeRuntimeConfig } from './common/runtime-config';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  tenantId: string;
  scope: string;
}

async function bootstrap() {
  assertSafeRuntimeConfig(process.env);

  passport.use(
    'jwt',
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET!,
      },
      (payload: JwtPayload, done) => {
        done(null, {
          id: payload.sub,
          username: payload.username,
          role: payload.role,
          tenantId: payload.tenantId,
          scope: payload.scope,
        });
      },
    ),
  );

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:6002',
  });

  const port = process.env.PORT ?? 6001;
  await app.listen(port);
  Logger.log(
    `OpenViking 服务已启动: http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
}
void bootstrap();
