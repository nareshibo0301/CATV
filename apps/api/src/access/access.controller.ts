import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@catv/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DataScopeService } from './data-scope.service';

@ApiTags('Access')
@ApiCookieAuth()
@Controller('access')
export class AccessController {
  constructor(private readonly scope: DataScopeService) {}

  @Get('scope')
  async preview(@CurrentUser() user: AuthUser): Promise<{ kind: 'all' } | { kind: 'restricted'; count: number }> {
    const resolved = await this.scope.resolve(user);
    if (resolved.kind === 'all') {
      return { kind: 'all' };
    }
    return { kind: 'restricted', count: resolved.ids.length };
  }
}
