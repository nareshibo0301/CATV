import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { loginSchema, REFRESH_COOKIE, type AuthUser, type LoginInput } from '@catv/shared';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', example: 'admin@catv.local' },
        password: { type: 'string', example: 'ChangeMeNow!123' },
      },
    },
  })
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const session = await this.auth.login(body, meta(req));
    setAuthCookies(res, session, this.cookieSettings(), req);
    return { user: session.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      clearAuthCookies(res, this.cookieSettings());
      throw new UnauthorizedException('Session expired.');
    }
    const session = await this.auth.refresh(token, meta(req));
    setAuthCookies(res, session, this.cookieSettings(), req);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], meta(req));
    clearAuthCookies(res, this.cookieSettings());
    return { ok: true };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOkResponse({ description: 'The signed-in user' })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  private cookieSettings() {
    return {
      accessTtl: this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
      refreshTtl: this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
      secure: this.config.getOrThrow<string>('COOKIE_SECURE') === 'true',
    };
  }

}

function meta(req: Request): { ip: string | null; userAgent: string | null } {
  const agent = req.get('user-agent') ?? null;
  return {
    ip: req.ip ?? null,
    userAgent: agent ? agent.slice(0, 512) : null,
  };
}
