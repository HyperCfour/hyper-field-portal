import { existsSync } from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import Portal from '../../components/Portal';
import { PORTALS, getPortal, publicPortal } from '../../lib/portals.mjs';

export const dynamicParams = false;
export const generateStaticParams = () => PORTALS.map(p => ({ portal: p.slug }));

// A banner's logo is public/assets/banners/<banner id>.svg (or .png, .webp). No file: the banner name is shown as text.
function logosFor(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    for (const ext of ['svg', 'png', 'webp']) {
      if (existsSync(path.join(process.cwd(), 'public', 'assets', 'banners', `${id}.${ext}`))) { out[id] = `/assets/banners/${id}.${ext}`; break; }
    }
  }
  return out;
}

export default async function Page({ params }: { params: Promise<{ portal: string }> }) {
  const portal = getPortal((await params).portal);
  if (!portal) notFound();
  return <Portal portal={publicPortal(portal, logosFor(portal.banners))} />;
}
