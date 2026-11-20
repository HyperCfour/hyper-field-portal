// Pure helpers shared by the browser and the server. No imports, no network, no DOM.
// Tested in tests/shared.test.mjs.

// Ticket form options mirror the Support Tickets board labels (ids are the dropdown label ids).
export const SYMPTOMS = [
  ['1', 'Blank or no display'],
  ['2', 'Frozen image'],
  ['3', 'Wrong or missing content'],
  ['5', 'Flickering or colour fault'],
  ['6', 'Physical damage'],
  ['8', 'Other'],
];
// Pre-check 1 (Screen ID confirmed) is set automatically because the screen came from the register.
// Pre-check 6 (photo attached) is set automatically when a photo is attached.
export const CHECKS = [
  ['2', 'Power checked at the wall and the player'],
  ['3', 'Cables checked and reseated'],
  ['4', 'Store internet working'],
  ['5', 'Player restarted'],
];
export const MAX_PHOTOS = 4;
export const PHOTO_EDGE = 1600;
export const PHOTO_QUALITY = 0.8;
export const PHOTO_MAX_BYTES = 1_000_000;
export const NOTES_MAX = 2000;

// NZ mobiles only. Accepts 021 123 4567, 0211234567, +64 21 123 4567, +64 (0)21 123 4567, 0064 21 123 4567, 6421234567;
// returns +642… or null.
export const nzMobile = raw => {
  const d = String(raw || '').replace(/[^\d+]/g, '').replace(/^00(?=64)/, '+');
  const n = (d.startsWith('+64') ? d.slice(3) : d.startsWith('64') ? d.slice(2) : d).replace(/^0/, '');
  return /^2\d{7,9}$/.test(n) ? '+64' + n : null;
};
export const fmtPhone = p => String(p || '').replace(/^\+64(\d{2})(\d{3})(\d+)$/, '+64 $1 $2 $3');

// Register device names are "<site> - <position>", sometimes with the site abbreviated ("Mobil 10th Ave - Menu Board 1").
// No site name contains a dash, so strip up to the first one.
export const shortName = x => String(x.device || '').replace(/^[^-]*-\s*/, '').trim() || x.device || x.code;

export const liveAt = (site, screens) => screens.filter(x => x.site === site.id && x.lifecycle === 'Live');

// Whole site: every live screen at the site is selected, and there are at least two. One ticket per screen, all P1.
export const isWholeSite = (site, picked, screens) => {
  const live = liveAt(site, screens);
  return live.length >= 2 && live.every(x => picked.some(p => p.id === x.id));
};

/**
 * One ticket per picked screen, in the order picked.
 * @param {object} args
 * @param {{id:string,name:string}} args.site
 * @param {Array<{id:string,code:string,device:string}>} args.picked
 * @param {{symptoms:string[],checks:string[],notes:string,job?:string,photos:string[]}} args.form
 * @param {{name:string,phone:string}} args.tech
 * @param {Array<object>} args.screens  every screen at the site (for the whole-site rule)
 * @param {Record<string,{id:string,name:string}>} [args.related]  open ticket per screen id, from the server
 */
export function buildTickets({ site, picked, form, tech, screens, related = {} }) {
  const p1 = isWholeSite(site, picked, screens);
  const first = picked[0];
  return picked.map((x, i) => {
    const rest = picked.filter(p => p.id !== x.id).map(p => p.code);
    const dup = related[x.id];
    const lines = [
      dup ? `Possible duplicate of ${dup.name}.` : '',
      p1 ? `Whole site affected: all ${picked.length} screens reported in one submission.` : (rest.length ? `Reported with ${rest.join(', ')} in the same submission.` : ''),
      i > 0 && form.photos.length ? `Photos attached to ${first.device}.` : '',
      form.notes,
    ].filter(Boolean);
    const cols = {
      screen_ref: x.code,
      t_screen: { item_ids: [Number(x.id)] },
      req_type: { label: 'Fault' },
      net_ref: { label: 'Mobil' },
      channel: { label: 'Partner escalation' },
      raised_org: { label: 'Partner' },
      priority: { label: p1 ? 'P1 Critical' : 'P2 High' },
      symptom: { ids: form.symptoms.map(Number) },
      prechecks: { ids: [1, ...form.checks.map(Number), ...(form.photos.length ? [6] : [])] },
      raised_by: `${tech.name} (Clarksons)`,
      c_phone: { phone: tech.phone, countryShortName: 'NZ' },
      ...(form.job ? { partner_ref: form.job } : {}),
      ...(dup ? { parent_tkt: { item_ids: [Number(dup.id)] } } : {}),
      description: { text: lines.join('\n') },
    };
    return { screenId: x.id, name: x.device, code: x.code, priority: cols.priority.label, cols };
  });
}
