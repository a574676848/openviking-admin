import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  tenantId: string;
  scope: string;
}

async function bootstrap() {
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
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:6002',
  });

  const port = process.env.PORT ?? 6001;
  await app.listen(port);
  Logger.log(
    `OpenViking 服务已启动: http://localhost:${port}/api`,
    'Bootstrap',
  );
}
void bootstrap();
