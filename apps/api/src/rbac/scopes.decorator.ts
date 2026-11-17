import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';

export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

export function scopeAllows(have: string[], need: string[]): boolean {
  return need.every((scope) => have.includes(scope));
}
