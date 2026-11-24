import { NextResponse } from 'next/server';
import { getPortal } from '../../../../../lib/portals.mjs';
import { getRegister } from '../../../../../lib/register';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ portal: string }> }) {
  const { portal: slug } = await ctx.params;
  if (!getPortal(slug)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const reg = await getRegister(slug);
    return NextResponse.json(reg, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (err) {
    console.error('register read failed', slug, err);
    return NextResponse.json({ error: "Couldn't load the register. Try again in a moment." }, { status: 502 });
  }
}
