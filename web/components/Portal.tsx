'use client';

// The flow: banner (only on a portal with several), details, site, screens, fault, sent. Against the live register.
// Everything retailer-specific comes in through the portal prop; nothing here names a retailer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHECKS, MAX_PHOTOS, PHOTO_EDGE, PHOTO_QUALITY, SYMPTOMS, fmtPhone, isWholeSite, nzMobile, shortName } from '../lib/shared.mjs';
import type { PublicPortal } from '../lib/portals.mjs';
import { IconBack, IconCheck, IconX, Logo } from './Logo';

type Banner = PublicPortal['banners'][number];
type Role = PublicPortal['roles'][number];
type Site = { id: string; name: string; street: string; region: string; banner: string };
type Screen = { id: string; code: string; device: string; position: string; lifecycle: string; health: string; since: string; site: string };
type Register = { sites: Site[]; screens: Screen[]; fetchedAt: string };
type Tech = { name: string; phone: string; remember: boolean; role: string };
type Form = { symptoms: string[]; checks: string[]; notes: string; job: string; photos: string[] };
type View = 'banner' | 'tech' | 'site' | 'screens' | 'form' | 'done';
type Created = { id: string; name: string; code: string; priority: string; related: { id: string; name: string } | null };
type Result = { tickets: Created[]; photosAttached: number; site: string; symptoms: string[]; photos: number; job: string };

const store = (s: () => Storage) => ({
  get<T>(k: string): T | null { try { return JSON.parse(s().getItem(k) || 'null'); } catch { return null; } },
  set(k: string, v: unknown) { try { s().setItem(k, JSON.stringify(v)); } catch {} },
  del(k: string) { try { s().removeItem(k); } catch {} },
});
const local = store(() => localStorage), session = store(() => sessionStorage);

const blank = (): Form => ({ symptoms: [], checks: [], notes: '', job: '', photos: [] });
const daysSince = (d: string) => d ? Math.max(0, Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 864e5)) : null;

function Tag({ s }: { s: Screen }) {
  if (s.lifecycle === 'Out of rotation') return <span className="tag tag-warn">Switched off</span>;
  if (s.health === 'Online') return <span className="tag tag-ok">Online</span>;
  if (s.health === 'Offline') { const d = daysSince(s.since); return <span className="tag tag-bad">Offline{d !== null ? ` ${d}d` : ''}</span>; }
  if (s.health === 'Paused') return <span className="tag tag-warn">Paused</span>;
  return <span className="tag">Not yet seen</span>;
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', PHOTO_QUALITY);
  } finally { URL.revokeObjectURL(url); }
}
const kb = (dataUrl: string) => Math.round(dataUrl.length * 0.75 / 1024);

function BannerMark({ b, className }: { b: Banner; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return b.logo ? <img className={className} src={b.logo} alt={b.name} /> : <span className={className + ' banner-text'}>{b.name}</span>;
}

export default function Portal({ portal }: { portal: PublicPortal }) {
  const multi = portal.banners.length > 1;
  const soleRole = portal.roles.length === 1 ? portal.roles[0].id : '';
  const keyTech = `hfp:${portal.slug}:tech`, keyDraft = `hfp:${portal.slug}:draft`;
  const PREV: Record<View, View> = { banner: 'banner', tech: multi ? 'banner' : 'tech', site: multi ? 'banner' : 'tech', screens: 'site', form: 'screens', done: 'screens' };
  const roleOf = (t: Tech): Role | undefined => portal.roles.find(x => x.id === t.role);
  const [reg, setReg] = useState<Register | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [tech, setTech] = useState<Tech>({ name: '', phone: '', remember: true, role: soleRole });
  const [banner, setBanner] = useState<Banner | null>(multi ? null : portal.banners[0]);
  const [site, setSite] = useState<Site | null>(null);
  const [picked, setPicked] = useState<Screen[]>([]);
  const [form, setForm] = useState<Form>(blank());
  const [restored, setRestored] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const cur = useRef(0);
  const latest = useRef({ tech, banner, site, picked });
  latest.current = { tech, banner, site, picked };

  const ready = (t: Tech) => !!(t.name && nzMobile(t.phone) && roleOf(t));
  const can = (v: View) => {
    const { tech: t, banner: b, site: s, picked: p } = latest.current;
    const base = ready(t) && !!b;
    return { banner: multi, tech: true, site: base, screens: base && !!s, form: base && !!s && p.length > 0, done: false }[v];
  };
  const canRef = useRef(can); canRef.current = can;
  const prevRef = useRef(PREV); prevRef.current = PREV;

  const render = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
    setTimeout(() => { const h = document.querySelector<HTMLElement>('main h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }, 0);
  }, []);
  const go = useCallback((v: View, replace = false) => {
    if (replace) history.replaceState({ view: v, i: cur.current }, '');
    else { cur.current += 1; history.pushState({ view: v, i: cur.current }, ''); }
    render(v);
  }, [render]);
  const back = useCallback(() => {
    if (cur.current > 0) history.back();
    else go(prevRef.current[(history.state?.view as View) || 'site'], true);
  }, [go]);

  // Draft: site, screens and form text, kept on the phone. Photos are not kept.
  const saveDraft = useCallback((s: Site | null, p: Screen[], f: Form) => {
    local.set(keyDraft, { site: s?.id || null, picked: p.map(x => x.id), symptoms: f.symptoms, checks: f.checks, notes: f.notes, job: f.job });
  }, [keyDraft]);

  // Boot: profile, register, draft, first view, history.
  useEffect(() => {
    const saved = local.get<Tech>(keyTech) || session.get<Tech>(keyTech) || { name: '', phone: '', remember: true, role: '' };
    const t: Tech = { ...saved, role: soleRole || saved.role || '' };
    setTech(t);
    (async () => {
      try {
        const res = await fetch(`/api/p/${portal.slug}/register`, { cache: 'no-store' });
        if (res.status === 401) { location.href = `/${portal.slug}/access`; return; }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'register');
        const r: Register = json;
        setReg(r);
        let first: View = 'site';
        let s: Site | null = null, p: Screen[] = [], f = blank();
        const d = local.get<{ site: string | null; picked: string[]; symptoms: string[]; checks: string[]; notes: string; job: string }>(keyDraft);
        if (d?.site) {
          s = r.sites.find(x => x.id === d.site) || null;
          if (s) {
            p = (d.picked || []).map(id => r.screens.find(x => x.id === id)).filter((x): x is Screen => !!x && x.site === s!.id);
            f = { ...blank(), symptoms: d.symptoms || [], checks: d.checks || [], notes: d.notes || '', job: d.job || '' };
            setRestored(p.length > 0 || !!(f.notes || f.symptoms.length));
          }
        }
        // A restored draft brings its banner with it; otherwise a portal with several banners starts by asking.
        const b = (s && portal.banners.find(x => x.id === s!.banner)) || (multi ? null : portal.banners[0]);
        setBanner(b); setSite(s); setPicked(p); setForm(f);
        latest.current = { tech: t, banner: b, site: s, picked: p };
        if (!b) first = 'banner'; else if (!ready(t)) first = 'tech'; else if (s && p.length) first = 'form'; else if (s) first = 'screens';
        go(first, true);
      } catch {
        setLoadErr("Couldn't load the list. Check your signal and try again.");
      }
    })();
    // The portal never changes while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      let v: View = (e.state?.view as View) || 'site';
      cur.current = e.state?.i ?? 0;
      while (!canRef.current(v)) v = prevRef.current[v];
      render(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [render]);

  const shell = { portal, banner, tech, role: roleOf(tech) };
  if (loadErr) return <Shell {...shell} onEdit={() => {}}><section className="section"><h2>Something went wrong</h2><p className="body-sm">{loadErr}</p><button className="btn-primary" type="button" onClick={() => location.reload()}>Try again</button></section></Shell>;
  if (!reg || !view) return <Shell {...shell} onEdit={() => {}}><section className="section"><p className="body-sm">Loading the list.</p></section></Shell>;

  const screensAt = (s: Site) => reg.screens.filter(x => x.site === s.id).sort((a, b) => a.device.localeCompare(b.device));
  const whole = site ? isWholeSite(site, picked, reg.screens) : false;

  const place = banner?.place || 'store';
  const role = roleOf(tech);

  /* Banner: only on a portal with several */
  const BannerView = () => {
    const pick = (b: Banner) => {
      let s = site, p = picked, f = form;
      if (banner?.id !== b.id) { s = null; p = []; f = blank(); setSite(s); setPicked(p); setForm(f); local.del(keyDraft); }
      setBanner(b); latest.current = { ...latest.current, banner: b, site: s, picked: p };
      go(ready(tech) ? 'site' : 'tech');
    };
    return (
      <section className="section">
        <h2>Which store brand is it?</h2>
        <div className="banners">
          {portal.banners.map(b => (
            <button key={b.id} className="banner-card" type="button" aria-pressed={banner?.id === b.id} onClick={() => pick(b)}><BannerMark b={b} className="banner-card-mark" /></button>
          ))}
        </div>
      </section>
    );
  };

  /* Details */
  const TechView = () => {
    const editing = ready(tech);
    const [name, setName] = useState(tech.name);
    const [phone, setPhone] = useState(tech.phone);
    const [remember, setRemember] = useState(tech.remember !== false);
    const [roleId, setRoleId] = useState(tech.role || soleRole);
    const [err, setErr] = useState('');
    const save = () => {
      const n = name.trim(), p = nzMobile(phone);
      const e = !n ? 'Add your name.' : !p ? 'Enter an NZ mobile number, e.g. 021 123 4567.' : !portal.roles.some(x => x.id === roleId) ? 'Say whether you are at the store or at head office.' : '';
      if (e) { setErr(e); return; }
      const t: Tech = { name: n, phone: p!, remember, role: roleId };
      setTech(t); latest.current = { ...latest.current, tech: t };
      if (remember) { local.set(keyTech, t); session.del(keyTech); } else { session.set(keyTech, t); local.del(keyTech); }
      // First time through, the details step is replaced in history, so Back from the next step never lands on it.
      if (editing) back(); else go('site', true);
    };
    return (
      <form className="section" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        {(editing || multi) && <button className="btn-ghost btn-back" type="button" onClick={back}><IconBack />Back</button>}
        <h2>Your details</h2>
        <p className="body-sm">The desk uses your mobile to call you back.</p>
        <div className="field"><label htmlFor="t-name">Your name</label><input id="t-name" type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} aria-invalid={!!err && !name.trim()} /></div>
        <div className="field"><label htmlFor="t-phone">NZ mobile</label><input id="t-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="021 123 4567" value={phone} onChange={e => setPhone(e.target.value)} aria-invalid={!!err && !nzMobile(phone)} /></div>
        {portal.roles.length > 1 && (
          <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Where are you reporting from?</legend>
            <div className="checks">{portal.roles.map(x => (
              <label key={x.id} className="check"><input type="radio" name="role" checked={roleId === x.id} onChange={() => setRoleId(x.id)} /><span>{x.label}</span></label>
            ))}</div>
          </fieldset>
        )}
        <label className="check single"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>Remember me on this phone<br /><span className="caption">Skips this step next time. Untick on a shared device.</span></span></label>
        {err && <p className="notice notice-p1" role="alert">{err}</p>}
        <button className="btn-primary" type="submit">{editing ? 'Save' : `Find the ${place}`}</button>
      </form>
    );
  };

  /* Step 2 */
  const SiteView = () => {
    const [q, setQ] = useState('');
    const [nearNote, setNearNote] = useState(false);
    const t = q.trim().toLowerCase();
    const counts = new Map<string, number>(); reg.screens.forEach(s => counts.set(s.site, (counts.get(s.site) || 0) + 1));
    const mine = reg.sites.filter(s => s.banner === banner!.id);
    const hits = (t ? mine.filter(s => (s.name + ' ' + s.street + ' ' + s.region).toLowerCase().includes(t)) : mine).slice(0, t ? 30 : 8);
    const pick = (s: Site) => {
      let p = picked, f = form;
      if (!site || site.id !== s.id) { p = []; f = blank(); setPicked(p); setForm(f); }
      setSite(s); latest.current = { ...latest.current, site: s, picked: p }; saveDraft(s, p, f); go('screens');
    };
    return (
      <section className="section">
        {multi && <button className="btn-ghost btn-back" type="button" onClick={back}><IconBack />Change brand</button>}
        <h2>{role?.onSite ? `Which ${banner!.name} ${place} are you at?` : `Which ${banner!.name} ${place} has the fault?`}</h2>
        <div className="field"><label htmlFor="q">Search by {place}, street or town</label><input id="q" type="search" placeholder="e.g. Cameron Road, Tauranga" autoComplete="off" autoFocus value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="btn-ghost" type="button" onClick={() => setNearNote(true)}>Use my location</button>
        {nearNote && <p className="caption">Location sorting is coming. Search by name, street or town for now.</p>}
        <div className="rows" aria-live="polite">
          {hits.map(s => (
            <button key={s.id} className="row" type="button" onClick={() => pick(s)}>
              <div><div className="t">{s.name}</div><div className="m">{s.street}</div></div>
              <div className="end"><span className="m mono">{counts.get(s.id) || 0} screen{(counts.get(s.id) || 0) === 1 ? '' : 's'}</span></div>
            </button>
          ))}
          {t && !hits.length && <p className="caption" style={{ padding: '12px 16px' }}>No {banner!.name} {place} matches. Check the spelling, or call the HYPER desk.</p>}
        </div>
      </section>
    );
  };

  /* Step 3 */
  const ScreensView = () => {
    const s = site!;
    const list = screensAt(s);
    const live = list.filter(x => x.lifecycle === 'Live');
    const sel = (id: string) => picked.some(p => p.id === id);
    const allLive = live.length > 0 && live.every(x => sel(x.id));
    const update = (p: Screen[]) => { setPicked(p); latest.current = { ...latest.current, picked: p }; saveDraft(s, p, form); };
    const toggle = (x: Screen) => update(sel(x.id) ? picked.filter(p => p.id !== x.id) : [...picked, x]);
    const n = picked.length;
    return (
      <section className="section">
        <button className="btn-ghost btn-back" type="button" onClick={back}><IconBack />Change {place}</button>
        <div><div className="label">{s.region}</div><h2>{s.name}</h2><div className="caption">{s.street}</div></div>
        <div className="between">
          <div className="label">Which screens have the fault? {list.length} registered</div>
          {live.length >= 2 && <button className="btn-ghost" type="button" onClick={() => update(allLive ? [] : live.slice())}>{allLive ? 'Clear all' : `Select all ${live.length} live screens`}</button>}
        </div>
        <div className="rows">
          {list.map(x => (
            <button key={x.id} className="row" type="button" aria-pressed={sel(x.id)} onClick={() => toggle(x)}>
              <div><div className="t">{shortName(x)}</div><div className="m"><span className="mono">{x.code}</span>, {x.position}</div></div>
              <div className="end"><IconCheck /><Tag s={x} /></div>
            </button>
          ))}
        </div>
        <p className="caption">Screen not listed? It isn't on HYPER's register, so it can't be supported through this form. Call the HYPER desk.</p>
        {whole && <p className="notice notice-p1">All {live.length} live screens selected. This is raised as P1 Critical, one ticket per screen.</p>}
        <button className="btn-primary" type="button" disabled={!n} onClick={() => go('form')}>{n ? `Continue with ${n} screen${n === 1 ? '' : 's'}` : 'Continue'}</button>
      </section>
    );
  };

  /* Step 4 */
  const FormView = () => {
    const s = site!;
    const f = form;
    const setF = (patch: Partial<Form>) => { const nf = { ...form, ...patch }; setForm(nf); saveDraft(s, picked, nf); };
    const [err, setErr] = useState('');
    const [photoNote, setPhotoNote] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const sorted = picked.slice().sort((a, b) => a.device.localeCompare(b.device));
    const offCount = picked.filter(x => x.lifecycle === 'Out of rotation').length;
    const onFiles = async (files: FileList | null) => {
      if (!files) return;
      setPhotoNote('');
      const next = [...f.photos];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) { setPhotoNote(`Up to ${MAX_PHOTOS} photos. Remove one to add another.`); break; }
        try { next.push(await shrink(file)); } catch { setPhotoNote("Couldn't read one of the photos. Try taking it again."); }
      }
      setForm({ ...form, photos: next });
    };
    const send = async () => {
      const errs: string[] = [];
      if (!f.symptoms.length) errs.push('pick at least one symptom');
      if (f.checks.length < CHECKS.length) errs.push(`complete all ${CHECKS.length} checks`);
      if (errs.length) { setErr('Before sending: ' + errs.join(', ') + '.'); return; }
      setErr(''); setSendErr(''); setSending(true);
      try {
        const res = await fetch(`/api/p/${portal.slug}/tickets`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tech: { name: tech.name, phone: tech.phone }, role: tech.role, siteId: s.id, screenIds: picked.map(p => p.id), symptoms: f.symptoms, checks: f.checks, notes: f.notes, job: f.job, photos: f.photos }),
        });
        if (res.status === 401) { location.href = `/${portal.slug}/access`; return; }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setSendErr(json.error || "Couldn't send. Try again."); return; }
        setResult({ ...json, symptoms: f.symptoms, photos: f.photos.length, job: f.job });
        local.del(keyDraft);
        setForm(blank()); setPicked([]); latest.current = { ...latest.current, picked: [] };
        go('done');
      } catch {
        setSendErr("Couldn't reach the server. Your report is still on this phone: check your signal and try again.");
      } finally { setSending(false); }
    };
    return (
      <section className="section">
        <button className="btn-ghost btn-back" type="button" onClick={back}><IconBack />Change screens</button>
        <h2>What&apos;s wrong?</h2>
        {restored && <p className="caption">Restored your unsent report from this phone.</p>}
        {picked.length === 1
          ? <div className="summary"><div><div className="t">{picked[0].device}</div><div className="m"><span className="mono">{picked[0].code}</span>, {s.name}</div></div><Tag s={picked[0]} /></div>
          : <div className="summary"><div><div className="t">{picked.length} screens at {s.name}</div><ul>{sorted.map(x => <li key={x.id}>{shortName(x)} <span className="mono">{x.code}</span></li>)}</ul></div></div>}
        {offCount > 0 && <p className="notice notice-warn">{offCount === 1 && picked.length === 1 ? `${banner!.name} has switched this screen off` : `${offCount} of these screens are switched off by ${banner!.name}`} until further notice. Only raise a fault if you were asked to work on {offCount === 1 ? 'it' : 'them'}.</p>}
        {whole && <p className="notice notice-p1">Whole {place} affected: raised as P1 Critical, one ticket per screen.</p>}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} className="field">
          <legend className="label" style={{ marginBottom: 8 }}>Symptom{picked.length > 1 ? ', applies to all selected screens' : ''}</legend>
          <div className="tags">{SYMPTOMS.map(([v, l]) => (
            <label key={v} className="tog"><input type="checkbox" checked={f.symptoms.includes(v)} onChange={e => setF({ symptoms: e.target.checked ? [...f.symptoms, v] : f.symptoms.filter(x => x !== v) })} /><span className="tag">{l}</span></label>
          ))}</div>
        </fieldset>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Checks before escalating, all required</div>
          <div className="checks">{CHECKS.map(([v, l]) => (
            <label key={v} className="check"><input type="checkbox" checked={f.checks.includes(v)} onChange={e => setF({ checks: e.target.checked ? [...f.checks, v] : f.checks.filter(x => x !== v) })} /><span>{l}</span></label>
          ))}</div>
        </div>
        <div className="field">
          <label htmlFor="add-photo">Photos of the screen and player <span className="caption">(optional, up to {MAX_PHOTOS}, resized on your phone)</span></label>
          <input ref={fileRef} id="photo" type="file" accept="image/*" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
          {f.photos.length > 0 && <div className="thumbs">{f.photos.map((p, i) => (
            <button key={i} type="button" className="thumb" aria-label={`Remove photo ${i + 1}, ${kb(p)} KB`} onClick={() => setForm({ ...form, photos: f.photos.filter((_, j) => j !== i) })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" /><span className="x"><IconX /></span>
            </button>
          ))}</div>}
          {f.photos.length < MAX_PHOTOS && <button className="btn-secondary" id="add-photo" type="button" onClick={() => fileRef.current?.click()}>Add photos</button>}
          {photoNote && <p className="caption">{photoNote}</p>}
        </div>
        <div className="field"><label htmlFor="notes">What you&apos;ve found</label><textarea id="notes" placeholder="e.g. Player has power but no network light. Restarted twice." value={f.notes} onChange={e => setF({ notes: e.target.value })} /></div>
        {role?.jobLabel && <div className="field"><label htmlFor="job">{role.jobLabel}</label><input id="job" type="text" placeholder="Optional" value={f.job} onChange={e => setF({ job: e.target.value })} /></div>}
        {err && <p className="err">{err}</p>}
        {sendErr && <p className="notice notice-warn">{sendErr}</p>}
        <button className="btn-primary" type="button" disabled={sending} onClick={send}>{sending ? 'Sending' : 'Send to HYPER desk'}</button>
      </section>
    );
  };

  /* Sent */
  const DoneView = () => {
    const r = result!;
    const sym = SYMPTOMS.filter(([v]) => r.symptoms.includes(v)).map(([, l]) => l).join(', ');
    const p1 = r.tickets.some(t => t.priority === 'P1 Critical');
    const linked = r.tickets.filter(t => t.related);
    return (
      <section className="section">
        <h2 className="done">{r.tickets.length === 1 ? 'Sent to the HYPER desk' : `${r.tickets.length} tickets sent to the HYPER desk`}</h2>
        <p className="body-sm">The desk will triage remotely and call you on <span className="mono">{fmtPhone(tech.phone)}</span> if they need {role?.id === 'clarksons' ? 'you on site' : 'more from you'}.</p>
        <dl className="kv">
          <dt>{r.tickets.length === 1 ? 'Ticket' : 'Tickets'}</dt>
          <dd>{r.tickets.length === 1 ? r.tickets[0].name : <ul>{r.tickets.map(t => <li key={t.id}>{t.name} <span className="mono">{t.code}</span></li>)}</ul>}</dd>
          <dt>{place === 'site' ? 'Site' : 'Store'}</dt><dd>{r.site}</dd>
          <dt>Priority</dt><dd>{p1 ? `P1 Critical, whole ${place}` : 'P2 High'}</dd>
          <dt>Symptom</dt><dd>{sym}</dd>
          <dt>Checks</dt><dd>All {CHECKS.length} done</dd>
          <dt>Photos</dt><dd>{r.photos ? `${r.photosAttached} of ${r.photos} attached` : 'None'}</dd>
          {r.job && <><dt>Job number</dt><dd>{r.job}</dd></>}
        </dl>
        {linked.length > 0 && <p className="caption">The desk already had an open ticket for {linked.length === 1 ? 'this screen' : `${linked.length} of these screens`}. Your report is linked to it, so nothing is lost.</p>}
        <div className="actions">
          <button className="btn-primary" type="button" onClick={() => { saveDraft(site, [], blank()); go('screens'); }}>Raise another at this {place}</button>
          <button className="btn-secondary" type="button" onClick={() => { setSite(null); latest.current = { ...latest.current, site: null }; local.del(keyDraft); go(multi ? 'banner' : 'site'); }}>New {place}</button>
        </div>
      </section>
    );
  };

  const stepOf: Record<View, number> = { banner: 0, tech: 1, site: 2, screens: 3, form: 4, done: 4 };
  return (
    <Shell {...shell} step={stepOf[view] + (multi ? 1 : 0)} steps={multi ? 5 : 4} onEdit={() => go('tech')}>
      {view === 'banner' && <BannerView />}
      {view === 'tech' && <TechView />}
      {view === 'site' && banner && <SiteView />}
      {view === 'screens' && site && <ScreensView />}
      {view === 'form' && site && picked.length > 0 && <FormView />}
      {view === 'done' && result && <DoneView />}
    </Shell>
  );
}

function Shell({ portal, banner, tech, role, step = 0, steps = 4, onEdit, children }: { portal: PublicPortal; banner: Banner | null; tech: Tech; role?: Role; step?: number; steps?: number; onEdit: () => void; children: React.ReactNode }) {
  const named = !!(tech.name && nzMobile(tech.phone) && role);
  return (
    <div className="wrap">
      <div className="top">
        <Logo />
        {named && <span className="who"><span>{tech.name}, {role!.short}</span><button className="btn-ghost" type="button" onClick={onEdit}>Edit</button></span>}
      </div>
      <div className="section" style={{ gap: 'var(--space-sm)' }}>
        {banner && <BannerMark b={banner} className="banner-mark" />}
        <div className="label">{portal.label}</div>
        <h1 className="title">Raise a screen fault</h1>
      </div>
      <div className="steps" aria-hidden="true">{Array.from({ length: steps }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</div>
      <main>{children}</main>
      <footer>HYPER Network Operations</footer>
    </div>
  );
}
