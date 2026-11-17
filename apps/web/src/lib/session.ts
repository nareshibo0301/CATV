import { cookies } from 'next/headers';
import type { AuthUser } from '@catv/shared';

export type ScopePreview = { kind: 'all' } | { kind: 'restricted'; count: number };

function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
}

export async function serverApi(path: string): Promise<Response> {
  const jar = await cookies();
  return fetch(`${apiBase()}${path}`, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
}

export async function getMe(): Promise<AuthUser | null> {
  const response = await serverApi('/api/v1/auth/me');
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as AuthUser;
}

export async function getScope(): Promise<ScopePreview | null> {
  const response = await serverApi('/api/v1/access/scope');
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as ScopePreview;
}
