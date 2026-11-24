import { notFound } from 'next/navigation';
import AccessForm from '../../../components/AccessForm';
import { PORTALS, getPortal } from '../../../lib/portals.mjs';

export const dynamicParams = false;
export const generateStaticParams = () => PORTALS.map(p => ({ portal: p.slug }));

export default async function AccessPage({ params }: { params: Promise<{ portal: string }> }) {
  const portal = getPortal((await params).portal);
  if (!portal) notFound();
  return <AccessForm slug={portal.slug} label={portal.label} />;
}
