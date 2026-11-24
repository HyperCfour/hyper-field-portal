export type Banner = { id: string; name: string; network: string; group: string; place: string };
export type Role = { id: string; label: string; short: string; org: string; channel: string; jobLabel: string; onSite: boolean };
export type PortalConfig = { slug: string; name: string; label: string; banners: string[]; roles: string[] };
export type PublicPortal = {
  slug: string; name: string; label: string;
  banners: { id: string; name: string; place: string; logo: string }[];
  roles: { id: string; label: string; short: string; jobLabel: string; onSite: boolean }[];
};
export const BANNERS: Record<string, Banner>;
export const ROLES: Record<string, Role>;
export const PORTALS: PortalConfig[];
export function getPortal(slug: string): PortalConfig | null;
export function raisedBy(name: string, role: Role, banner: Banner): string;
export function ticketMeta(name: string, roleId: string, bannerId: string): { network: string; org: string; channel: string; raisedBy: string };
export function publicPortal(portal: PortalConfig, logos?: Record<string, string>): PublicPortal;
export function codeEnvName(slug: string): string;
