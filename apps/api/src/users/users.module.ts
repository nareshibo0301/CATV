import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { NetworkModule } from '../network/network.module';
import { UserCodeService } from './user-code.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AccessModule, NetworkModule],
  controllers: [UsersController],
  providers: [UsersService, UserCodeService],
  exports: [UsersService, UserCodeService],
})
export class UsersModule {}
