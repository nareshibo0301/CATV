import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { AccessModule } from './access/access.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AttributesModule } from './attributes/attributes.module';
import { SettingsModule } from './settings/settings.module';
import { CommissionsModule } from './commissions/commissions.module';
import { NetworkModule } from './network/network.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { RequestLogMiddleware } from './common/middleware/request-log.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    RbacModule,
    AccessModule,
    AdminModule,
    HealthModule,
    UsersModule,
    AttributesModule,
    SettingsModule,
    CommissionsModule,
    NetworkModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLogMiddleware, CsrfMiddleware).forRoutes('*');
  }
}
