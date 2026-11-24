// The portals: one web address per retailer (or retailer group), all on the same code and the same monday boards.
// Pure config, no secrets. Server only: the browser gets just its own portal, shaped by publicPortal().
// Tested in tests/shared.test.mjs.

// A banner is one retail brand: a group on the Screen Register and a "Network (as reported)" label on Support Tickets.
export const BANNERS = {
  mobil: { id: 'mobil', name: 'Mobil', network: 'Mobil', group: 'group_mm8baqwb', place: 'site' },
  // Spelt as one word to match the register's site names ("Foursquare Cambridge").
  foursquare: { id: 'foursquare', name: 'Foursquare', network: 'Foursquare', group: 'group_mm8bhsmq', place: 'store' },
  liquorland: { id: 'liquorland', name: 'Liquorland', network: 'Liquorland', group: 'group_mm8bd7rg', place: 'store' },
  briscoes: { id: 'briscoes', name: 'Briscoes', network: 'Briscoes', group: 'group_mm8bjcme', place: 'store' },
  'rebel-sport': { id: 'rebel-sport', name: 'Rebel Sport', network: 'Rebel Sport', group: 'group_mm8bj6v', place: 'store' },
};

// Who is raising the ticket. org and channel are labels on the Support Tickets board.
export const ROLES = {
  clarksons: { id: 'clarksons', label: 'Clarksons technician', short: 'Clarksons', org: 'Partner', channel: 'Partner escalation', jobLabel: 'Clarksons job number', onSite: true },
  store: { id: 'store', label: 'Store owner or operator', short: 'Store', org: 'Store', channel: 'QR / web form', jobLabel: '', onSite: true },
  'head-office': { id: 'head-office', label: 'Head office', short: 'Head office', org: 'Client', channel: 'QR / web form', jobLabel: '', onSite: false },
};

export const PORTALS = [
  { slug: 'mobil', name: 'Mobil', label: 'Field support, Mobil', banners: ['mobil'], roles: ['clarksons'] },
  { slug: 'foursquare', name: 'Foursquare', label: 'Screen support, Foursquare', banners: ['foursquare'], roles: ['store', 'head-office'] },
  { slug: 'liquorland', name: 'Liquorland', label: 'Screen support, Liquorland', banners: ['liquorland'], roles: ['store', 'head-office'] },
  { slug: 'briscoe-group', name: 'Briscoes and Rebel Sport', label: 'Screen support, Briscoe Group', banners: ['briscoes', 'rebel-sport'], roles: ['head-office'] },
];

export const getPortal = slug => PORTALS.find(p => p.slug === slug) || null;

// "Sam Tech (Clarksons)", "Sam Owner (Foursquare store)", "Sam Buyer (Briscoes head office)".
export const raisedBy = (name, role, banner) =>
  `${name} (${role.id === 'clarksons' ? 'Clarksons' : role.id === 'store' ? `${banner.name} store` : `${banner.name} head office`})`;

// Ticket fields that depend on who raised it and for which banner.
export const ticketMeta = (name, roleId, bannerId) => {
  const role = ROLES[roleId], banner = BANNERS[bannerId];
  return { network: banner.network, org: role.org, channel: role.channel, raisedBy: raisedBy(name, role, banner) };
};

// What the browser is allowed to know about its own portal. logos: banner id -> public path, when a logo file exists.
export const publicPortal = (portal, logos = {}) => ({
  slug: portal.slug,
  name: portal.name,
  label: portal.label,
  banners: portal.banners.map(id => ({ id, name: BANNERS[id].name, place: BANNERS[id].place, logo: logos[id] || '' })),
  roles: portal.roles.map(id => ({ id, label: ROLES[id].label, short: ROLES[id].short, jobLabel: ROLES[id].jobLabel, onSite: ROLES[id].onSite })),
});

// Access code for a portal: PORTAL_CODE_<SLUG> (e.g. PORTAL_CODE_BRISCOE_GROUP), falling back to PORTAL_CODE.
export const codeEnvName = slug => `PORTAL_CODE_${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
