import { NextResponse } from 'next/server';

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return '/dashboard';
  }
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
  const upstream = await fetch(`${api}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const login = NextResponse.redirect(new URL('/login', request.url));
    return login;
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
