import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@catv/shared';
import { ttlToMs } from './ttl';

export const CSRF_COOKIE = 'catv_csrf';

export interface CookieSettings {
  accessTtl: string;
  refreshTtl: string;
  secure: boolean;
}

const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  settings: CookieSettings,
  req?: Request,
): void {
  if (!req?.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, randomBytes(24).toString('hex'), {
      httpOnly: false,
      sameSite: 'lax',
      secure: settings.secure,
      path: '/',
      maxAge: ttlToMs(settings.refreshTtl),
    });
  }
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    secure: settings.secure,
    maxAge: ttlToMs(settings.accessTtl),
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    secure: settings.secure,
    maxAge: ttlToMs(settings.refreshTtl),
  });
}

export function clearAuthCookies(res: Response, settings: Pick<CookieSettings, 'secure'>): void {
  res.clearCookie(ACCESS_COOKIE, { ...base, secure: settings.secure });
  res.clearCookie(REFRESH_COOKIE, { ...base, secure: settings.secure });
}
