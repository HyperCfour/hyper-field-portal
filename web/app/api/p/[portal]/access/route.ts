import { NextResponse } from 'next/server';
import { COOKIE_MAX_AGE, accessToken, codeMatches, cookieName, portalCode } from '../../../../../lib/access';
import { getPortal } from '../../../../../lib/portals.mjs';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ portal: string }> }) {
  const { portal: slug } = await ctx.params;
  if (!getPortal(slug)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!portalCode(slug)) {
    return NextResponse.json({ error: 'The portal is not configured yet.' }, { status: 503 });
  }
  if (!codeMatches(code, slug)) {
    await new Promise(r => setTimeout(r, 600));
    return NextResponse.json({ error: 'That code is not right. Check it with the HYPER desk.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName(slug), await accessToken(code, slug), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
