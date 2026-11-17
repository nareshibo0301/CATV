import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@catv/shared';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/session/refresh')) {
    return NextResponse.next();
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (pathname === '/login') {
    if (access) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/forbidden') {
    return NextResponse.next();
  }

  if (!access && refresh) {
    const url = new URL('/session/refresh', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (!access) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // /api is proxied to Nest. If this matcher includes it, an unsigned request
  // is redirected to /login and the browser treats that HTML page as a successful sign-in.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
