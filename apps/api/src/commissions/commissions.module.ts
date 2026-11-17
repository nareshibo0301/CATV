import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';

@Module({
  imports: [AccessModule],
  controllers: [CommissionRulesController],
  providers: [CommissionRulesService],
})
export class CommissionsModule {}
