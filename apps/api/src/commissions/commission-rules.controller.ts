import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { commissionInputSchema, type AuthUser } from '@catv/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { CommissionRulesService } from './commission-rules.service';

@ApiTags('Commission rules')
@ApiCookieAuth()
@Controller('users/:userId/commission-rules')
export class CommissionRulesController {
  constructor(private readonly rules: CommissionRulesService) {}

  @Get()
  @Roles('ADMIN', 'DISTRIBUTOR')
  list(@CurrentUser() actor: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.rules.list(actor, userId);
  }

  @Post()
  @Roles('ADMIN')
  add(
    @CurrentUser() actor: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(commissionInputSchema)) body: ReturnType<typeof commissionInputSchema.parse>,
    @Req() req: Request,
  ) {
    return this.rules.add(actor, userId, body, req.ip ?? null);
  }
}
