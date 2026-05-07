import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
  VersioningType,
  RequestMethod,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { assertSafeRuntimeConfig } from './common/runtime-config';
import {
  WEBDAV_ALLOW,
  WEBDAV_DAV,
  WEBDAV_ROOT_PATH,
  WEBDAV_TEXT_CONTENT_TYPE,
} from './webdav/webdav.constants';

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

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    WEBDAV_ROOT_PATH,
    (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'OPTIONS') {
        next();
        return;
      }

      res.setHeader('Allow', WEBDAV_ALLOW);
      res.setHeader('DAV', WEBDAV_DAV);
      res.setHeader('Content-Type', WEBDAV_TEXT_CONTENT_TYPE);
      res.status(200).send('');
    },
  );

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'webdav/{*path}', method: RequestMethod.ALL }],
  });
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
