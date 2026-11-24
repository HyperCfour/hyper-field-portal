// Access gate. One shared code per portal (PORTAL_CODE_<SLUG>, falling back to PORTAL_CODE). The cookie holds a hash of
// the code and the portal, so changing a code signs that portal's devices out and one portal's cookie never opens another.
// Web Crypto only, so this runs in middleware too.

import { codeEnvName } from './portals.mjs';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
export const cookieName = (slug: string) => `hfp_${slug.replace(/[^a-z0-9]/g, '_')}`;

export const portalCode = (slug: string): string => process.env[codeEnvName(slug)] || process.env.PORTAL_CODE || '';

export async function accessToken(code: string, slug: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${slug}:hfp-v2`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hasAccess(cookieValue: string | undefined, slug: string): Promise<boolean> {
  const code = portalCode(slug);
  if (!code || !cookieValue) return false;
  return cookieValue === (await accessToken(code, slug));
}

export function codeMatches(given: string, slug: string): boolean {
  const code = portalCode(slug);
  if (!code || given.length !== code.length) return false;
  let diff = 0;
  for (let i = 0; i < code.length; i++) diff |= code.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
