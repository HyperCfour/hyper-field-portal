import { NextResponse } from 'next/server';
import { getPortal } from '../../../../../lib/portals.mjs';
import { ValidationError, createTickets, validate } from '../../../../../lib/tickets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Best-effort limiter per IP on a warm instance. A durable one needs KV; see BUILD.md.
const WINDOW_MS = 10 * 60 * 1000, LIMIT = 10;
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

export async function POST(req: Request, ctx: { params: Promise<{ portal: string }> }) {
  const { portal: slug } = await ctx.params;
  const portal = getPortal(slug);
  if (!portal) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (limited(ip)) return NextResponse.json({ error: 'Too many submissions. Wait a few minutes or call the HYPER desk.' }, { status: 429 });

  const body = await req.json().catch(() => null);
  const v = validate(body, portal);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const result = await createTickets(v.sub, portal);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('ticket creation failed', slug, err);
    return NextResponse.json({ error: "Couldn't reach the HYPER desk system. Your report is still on this phone: try again, or call the desk." }, { status: 502 });
  }
}
