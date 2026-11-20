// Screen Register and Sites, shaped for the portal. Mobil group only, Decommissioned and Removed excluded.
// Cached for 10 minutes so register changes show quickly without a monday call per visit.

import { unstable_cache } from 'next/cache';
import { BOARDS, GROUPS, gql } from './monday';

export type Site = { id: string; name: string; street: string; region: string; status: string };
export type Screen = {
  id: string; code: string; device: string; position: string; cms: string;
  lifecycle: string; health: string; since: string; site: string;
};
export type Register = { sites: Site[]; screens: Screen[]; fetchedAt: string };

type ColumnValue = { id: string; text: string | null; linked_item_ids?: string[] };
type Item = { id: string; name: string; group?: { id: string }; column_values: ColumnValue[] };

const SCREEN_COLS = '["legacy_ids","reg_site","position","cms","lifecycle","health","offline_since"]';
const ITEM_FIELDS = `id name group { id } column_values(ids: ${SCREEN_COLS}) { id text ... on BoardRelationValue { linked_item_ids } }`;

const col = (it: Item, id: string) => it.column_values.find(c => c.id === id);

async function fetchScreens(): Promise<Screen[]> {
  const items: Item[] = [];
  // Scoped to the Mobil group server-side: about a third of the items and a third of the time of a whole-board read.
  const first = await gql<{ boards: { groups: { items_page: { cursor: string | null; items: Item[] } }[] }[] }>(
    `query ($b: [ID!], $g: [String!]) { boards(ids: $b) { groups(ids: $g) { items_page(limit: 500, query_params: { rules: [{ column_id: "lifecycle", compare_value: [6, 3], operator: not_any_of }] }) { cursor items { ${ITEM_FIELDS} } } } } }`,
    { b: [BOARDS.register], g: [GROUPS.mobil] },
  );
  let page = first.boards[0]?.groups[0]?.items_page;
  if (!page) throw new Error('Screen Register not readable');
  items.push(...page.items);
  let guard = 0;
  while (page.cursor && guard++ < 20) {
    const next = await gql<{ next_items_page: { cursor: string | null; items: Item[] } }>(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${ITEM_FIELDS} } } }`,
      { c: page.cursor },
    );
    page = next.next_items_page;
    items.push(...page.items);
  }
  return items
    .filter(it => it.group?.id === GROUPS.mobil)
    .map(it => ({
      id: String(it.id),
      code: it.name,
      device: col(it, 'legacy_ids')?.text || it.name,
      position: col(it, 'position')?.text || '',
      cms: col(it, 'cms')?.text || '',
      lifecycle: col(it, 'lifecycle')?.text || '',
      health: col(it, 'health')?.text || '',
      since: col(it, 'offline_since')?.text || '',
      site: String(col(it, 'reg_site')?.linked_item_ids?.[0] ?? ''),
    }));
}

async function fetchSites(ids: string[]): Promise<Site[]> {
  const out: Site[] = [];
  // items(ids:) returns 25 by default and allows at most 100 ids per call, so chunk and set the limit explicitly.
  for (let i = 0; i < ids.length; i += 100) {
    const data = await gql<{ items: Item[] }>(
      `query ($ids: [ID!]) { items(ids: $ids, limit: 100) { id name column_values(ids: ["street","region","site_status"]) { id text } } }`,
      { ids: ids.slice(i, i + 100) },
    );
    for (const it of data.items) {
      out.push({
        id: String(it.id),
        name: it.name,
        street: col(it, 'street')?.text || '',
        region: col(it, 'region')?.text || '',
        status: col(it, 'site_status')?.text || '',
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchRegister(): Promise<Register> {
  const screens = await fetchScreens();
  const siteIds = [...new Set(screens.map(s => s.site).filter(Boolean))];
  const sites = (await fetchSites(siteIds)).filter(s => s.status !== 'Closed');
  const known = new Set(sites.map(s => s.id));
  return { sites, screens: screens.filter(s => known.has(s.site)), fetchedAt: new Date().toISOString() };
}

export const getRegister = unstable_cache(fetchRegister, ['field-portal-register-v2'], { revalidate: 600 });
