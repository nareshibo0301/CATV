import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_COOKIE } from '@catv/shared';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { JobsService } from './network/jobs.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(ConfigService);

  const http = app.getHttpAdapter().getInstance() as { set: (key: string, value: number) => void };
  http.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (config.getOrThrow<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token', 'Idempotency-Key', 'X-CATV-Signature', 'X-CATV-Timestamp'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });

  const swagger = new DocumentBuilder()
    .setTitle('CATV API')
    .setDescription('Cable network management platform')
    .setVersion('1.0')
    .addCookieAuth('catv_access')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const jobs = app.get(JobsService);
  const jwt = app.get(JwtService);
  const prisma = app.get(PrismaService);
  app.use('/api/v1/admin/queues', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
      if (!token) {
        res.status(401).end();
        return;
      }
      const payload = await jwt.verifyAsync<{ sub: string }>(token);
      const user = await prisma.user.findFirst({ where: { id: payload.sub, role: 'ADMIN', deletedAt: null, status: 'ACTIVE' } });
      if (!user) {
        res.status(403).end();
        return;
      }
      next();
    } catch {
      res.status(401).end();
    }
  }, jobs.board.getRouter());

  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
