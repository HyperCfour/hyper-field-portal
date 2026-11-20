// Access gate. One shared code for Clarksons (PORTAL_CODE). The cookie holds a hash of the code,
// so changing the code signs every device out. Web Crypto only, so this runs in middleware too.

export const COOKIE = 'hfp_access';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export async function accessToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:hfp-v1`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hasAccess(cookieValue: string | undefined): Promise<boolean> {
  const code = process.env.PORTAL_CODE;
  if (!code || !cookieValue) return false;
  return cookieValue === (await accessToken(code));
}

export function codeMatches(given: string): boolean {
  const code = process.env.PORTAL_CODE || '';
  if (!code || given.length !== code.length) return false;
  let diff = 0;
  for (let i = 0; i < code.length; i++) diff |= code.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
