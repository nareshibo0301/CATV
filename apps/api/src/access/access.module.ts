import { Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { DataScopeService } from './data-scope.service';

@Module({
  controllers: [AccessController],
  providers: [DataScopeService],
  exports: [DataScopeService],
})
export class AccessModule {}
