import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 2,
        });
        client.on('error', (error: Error) => {
          process.stderr.write(
            `${JSON.stringify({ level: 'error', message: 'redis', err: error.message })}\n`,
          );
        });
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
