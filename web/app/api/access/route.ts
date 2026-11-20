import { NextResponse } from 'next/server';
import { COOKIE, COOKIE_MAX_AGE, accessToken, codeMatches } from '../../../lib/access';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!process.env.PORTAL_CODE) {
    return NextResponse.json({ error: 'The portal is not configured yet.' }, { status: 503 });
  }
  if (!codeMatches(code)) {
    await new Promise(r => setTimeout(r, 600));
    return NextResponse.json({ error: 'That code is not right. Check it with the HYPER desk.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await accessToken(code), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
