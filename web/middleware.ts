import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, hasAccess } from './lib/access';

export async function middleware(req: NextRequest) {
  if (await hasAccess(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Access code required.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/access';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/', '/api/register', '/api/tickets'],
};
