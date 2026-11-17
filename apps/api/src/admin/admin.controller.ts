import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@catv/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  @Get('ping')
  ping(@CurrentUser() user: AuthUser): { ok: true; adminType: AuthUser['adminType'] } {
    return { ok: true, adminType: user.adminType };
  }
}
