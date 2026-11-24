import { NextResponse, type NextRequest } from 'next/server';
import { cookieName, hasAccess } from './lib/access';
import { getPortal } from './lib/portals.mjs';

// Gate: /<portal> and /api/p/<portal>/* need that portal's access cookie. The access page and access API are open.
export async function middleware(req: NextRequest) {
  const seg = req.nextUrl.pathname.split('/').filter(Boolean);
  const isApi = seg[0] === 'api';
  const slug = isApi ? (seg[1] === 'p' ? seg[2] : '') : seg[0];
  const rest = isApi ? seg[3] : seg[1];
  if (!slug || !getPortal(slug) || rest === 'access') return NextResponse.next();
  if (await hasAccess(req.cookies.get(cookieName(slug))?.value, slug)) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: 'Access code required.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = `/${slug}/access`;
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static files (anything with a dot).
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
