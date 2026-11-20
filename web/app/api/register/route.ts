import { NextResponse } from 'next/server';
import { getRegister } from '../../../lib/register';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reg = await getRegister();
    return NextResponse.json(reg, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (err) {
    console.error('register read failed', err);
    return NextResponse.json({ error: "Couldn't load the register. Try again in a moment." }, { status: 502 });
  }
}
