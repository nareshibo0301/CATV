import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { idPrefixUpdateSchema, type AuthUser } from '@catv/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('id-prefixes')
  prefixes() {
    return this.settings.getPrefixes();
  }

  @Put('id-prefixes')
  updatePrefixes(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodPipe(idPrefixUpdateSchema)) body: ReturnType<typeof idPrefixUpdateSchema.parse>,
    @Req() req: Request,
  ) {
    return this.settings.updatePrefixes(actor, body, req.ip ?? null);
  }
}
