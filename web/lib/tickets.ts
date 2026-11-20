// Ticket creation: validate, check for open tickets on the same screens, create one ticket per screen, attach photos.

import { BOARDS, GROUPS, STATUS, addFile, gql } from './monday';
import { getRegister, type Screen, type Site } from './register';
import { CHECKS, MAX_PHOTOS, NOTES_MAX, PHOTO_MAX_BYTES, SYMPTOMS, buildTickets, nzMobile } from './shared.mjs';

export type Submission = {
  tech: { name: string; phone: string };
  siteId: string;
  screenIds: string[];
  symptoms: string[];
  checks: string[];
  notes: string;
  job: string;
  photos: string[]; // data URLs, JPEG, already resized on the device
};

export type Created = { id: string; name: string; code: string; priority: string; related: { id: string; name: string } | null };
export type Result = { tickets: Created[]; photosAttached: number; site: string };

const SYMPTOM_IDS = new Set(SYMPTOMS.map(([v]) => v));
const CHECK_IDS = CHECKS.map(([v]) => v);
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x)) : []);

export function validate(body: unknown): { ok: true; sub: Submission } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const tech = (b.tech && typeof b.tech === 'object' ? b.tech : {}) as Record<string, unknown>;
  const name = str(tech.name, 80);
  const phone = nzMobile(str(tech.phone, 30));
  if (!name) return { ok: false, error: 'Add your name.' };
  if (!phone) return { ok: false, error: 'Enter an NZ mobile number.' };
  const siteId = str(b.siteId, 30);
  const screenIds = [...new Set(arr(b.screenIds))].slice(0, 50);
  if (!siteId || !screenIds.length) return { ok: false, error: 'Pick at least one screen.' };
  const symptoms = [...new Set(arr(b.symptoms))].filter(s => SYMPTOM_IDS.has(s));
  if (!symptoms.length) return { ok: false, error: 'Pick at least one symptom.' };
  const checks = [...new Set(arr(b.checks))].filter(c => CHECK_IDS.includes(c));
  if (checks.length < CHECK_IDS.length) return { ok: false, error: `Complete all ${CHECK_IDS.length} checks.` };
  const photos = arr(b.photos).slice(0, MAX_PHOTOS);
  for (const p of photos) {
    if (!/^data:image\/jpeg;base64,/.test(p)) return { ok: false, error: 'Photos must be JPEG.' };
    if (p.length * 0.75 > PHOTO_MAX_BYTES) return { ok: false, error: 'A photo is too large. Try again from the camera.' };
  }
  return { ok: true, sub: { tech: { name, phone }, siteId, screenIds, symptoms, checks, notes: str(b.notes, NOTES_MAX), job: str(b.job, 60), photos } };
}

// Open tickets (not Closed, not Cancelled) linked to any of the given screens. Same definition as the n8n daily check.
export async function openTicketsByScreen(screenIds: string[]): Promise<Record<string, { id: string; name: string }>> {
  const want = new Set(screenIds);
  // compare_value must be inlined: monday's CompareValue scalar does not accept a list variable.
  const data = await gql<{ boards: { items_page: { items: { id: string; name: string; column_values: { id: string; linked_item_ids?: string[] }[] }[] } }[] }>(
    `query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 500, query_params: { rules: [{ column_id: "t_status", compare_value: [${STATUS.closed}, ${STATUS.cancelled}], operator: not_any_of }] }) { items { id name column_values(ids: ["t_screen"]) { id ... on BoardRelationValue { linked_item_ids } } } } } }`,
    { b: [BOARDS.tickets] },
  );
  const out: Record<string, { id: string; name: string }> = {};
  for (const t of data.boards[0]?.items_page.items ?? []) {
    for (const c of t.column_values) {
      for (const linked of c.linked_item_ids ?? []) {
        const id = String(linked);
        if (want.has(id) && !out[id]) out[id] = { id: String(t.id), name: t.name };
      }
    }
  }
  return out;
}

function decodeDataUrl(p: string): { bytes: ArrayBuffer; type: string } {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(p);
  if (!m) throw new Error('Bad photo');
  const buf = Buffer.from(m[2], 'base64');
  const bytes = new ArrayBuffer(buf.byteLength);
  new Uint8Array(bytes).set(buf);
  return { bytes, type: m[1] };
}

export async function createTickets(sub: Submission): Promise<Result> {
  const reg = await getRegister();
  const site: Site | undefined = reg.sites.find(s => s.id === sub.siteId);
  if (!site) throw new ValidationError('That site is not on the register any more. Go back and pick it again.');
  const atSite = reg.screens.filter(s => s.site === site.id);
  const picked: Screen[] = [];
  for (const id of sub.screenIds) {
    const s = atSite.find(x => x.id === id);
    if (!s) throw new ValidationError('A selected screen is not on the register for this site. Go back and pick again.');
    picked.push(s);
  }

  const related = await openTicketsByScreen(picked.map(p => p.id));
  const tickets = buildTickets({ site, picked, form: sub, tech: sub.tech, screens: atSite, related });

  const created: Created[] = [];
  for (const t of tickets) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $c: JSON!) { create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $c) { id } }`,
      { b: BOARDS.tickets, g: GROUPS.triage, n: t.name, c: JSON.stringify(t.cols) },
    );
    created.push({ id: String(data.create_item.id), name: t.name, code: t.code, priority: t.priority, related: related[t.screenId] ?? null });
  }

  // Photos go on the first ticket of the batch; the others' descriptions say so.
  let photosAttached = 0;
  if (created.length && sub.photos.length) {
    for (const [i, p] of sub.photos.entries()) {
      try {
        const { bytes, type } = decodeDataUrl(p);
        await addFile(created[0].id, 't_photos', bytes, `${created[0].code}-photo-${i + 1}.jpg`, type);
        photosAttached++;
      } catch (err) {
        console.error('photo upload failed', created[0].id, err);
      }
    }
  }
  return { tickets: created, photosAttached, site: site.name };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
