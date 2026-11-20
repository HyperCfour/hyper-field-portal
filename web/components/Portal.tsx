'use client';

// The field flow: details, site, screens, fault, sent. Same behaviour as prototype/app.html, against the live register.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHECKS, MAX_PHOTOS, PHOTO_EDGE, PHOTO_QUALITY, SYMPTOMS, fmtPhone, isWholeSite, nzMobile, shortName } from '../lib/shared.mjs';
import { IconBack, IconCheck, IconX, Logo } from './Logo';

type Site = { id: string; name: string; street: string; region: string };
type Screen = { id: string; code: string; device: string; position: string; cms: string; lifecycle: string; health: string; since: string; site: string };
type Register = { sites: Site[]; screens: Screen[]; fetchedAt: string };
type Tech = { name: string; phone: string; remember: boolean };
type Form = { symptoms: string[]; checks: string[]; notes: string; job: string; photos: string[] };
type View = 'tech' | 'site' | 'screens' | 'form' | 'done';
type Created = { id: string; name: string; code: string; priority: string; related: { id: string; name: string } | null };
type Result = { tickets: Created[]; photosAttached: number; site: string; symptoms: string[]; photos: number; job: string };

const store = (s: () => Storage) => ({
  get<T>(k: string): T | null { try { return JSON.parse(s().getItem(k) || 'null'); } catch { return null; } },
  set(k: string, v: unknown) { try { s().setItem(k, JSON.stringify(v)); } catch {} },
  del(k: string) { try { s().removeItem(k); } catch {} },
});
const local = store(() => localStorage), session = store(() => sessionStorage);

const blank = (): Form => ({ symptoms: [], checks: [], notes: '', job: '', photos: [] });
const PREV: Record<View, View> = { tech: 'tech', site: 'tech', screens: 'site', form: 'screens', done: 'screens' };
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

export default function Portal() {
  const [reg, setReg] = useState<Register | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [tech, setTech] = useState<Tech>({ name: '', phone: '', remember: true });
  const [site, setSite] = useState<Site | null>(null);
  const [picked, setPicked] = useState<Screen[]>([]);
  const [form, setForm] = useState<Form>(blank());
  const [restored, setRestored] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const cur = useRef(0);
  const latest = useRef({ tech, site, picked });
  latest.current = { tech, site, picked };

  const ready = (t: Tech) => !!(t.name && nzMobile(t.phone));
  const can = useCallback((v: View) => {
    const { tech: t, site: s, picked: p } = latest.current;
    return { tech: true, site: ready(t), screens: ready(t) && !!s, form: ready(t) && !!s && p.length > 0, done: false }[v];
  }, []);

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
    else go(PREV[(history.state?.view as View) || 'site'], true);
  }, [go]);

  // Draft: site, screens and form text, kept on the phone. Photos are not kept.
  const saveDraft = useCallback((s: Site | null, p: Screen[], f: Form) => {
    local.set('hyperDraft', { site: s?.id || null, picked: p.map(x => x.id), symptoms: f.symptoms, checks: f.checks, notes: f.notes, job: f.job });
  }, []);

  // Boot: profile, register, draft, first view, history.
  useEffect(() => {
    const t = local.get<Tech>('hyperTech') || session.get<Tech>('hyperTech') || { name: '', phone: '', remember: true };
    setTech(t);
    (async () => {
      try {
        const res = await fetch('/api/register', { cache: 'no-store' });
        if (res.status === 401) { location.href = '/access'; return; }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'register');
        const r: Register = json;
        setReg(r);
        let first: View = 'site';
        let s: Site | null = null, p: Screen[] = [], f = blank();
        const d = local.get<{ site: string | null; picked: string[]; symptoms: string[]; checks: string[]; notes: string; job: string }>('hyperDraft');
        if (d?.site) {
          s = r.sites.find(x => x.id === d.site) || null;
          if (s) {
            p = (d.picked || []).map(id => r.screens.find(x => x.id === id)).filter((x): x is Screen => !!x && x.site === s!.id);
            f = { ...blank(), symptoms: d.symptoms || [], checks: d.checks || [], notes: d.notes || '', job: d.job || '' };
            setRestored(p.length > 0 || !!(f.notes || f.symptoms.length));
          }
        }
        setSite(s); setPicked(p); setForm(f);
        latest.current = { tech: t, site: s, picked: p };
        if (!ready(t)) first = 'tech'; else if (s && p.length) first = 'form'; else if (s) first = 'screens';
        go(first, true);
      } catch {
        setLoadErr("Couldn't load the site list. Check your signal and try again.");
      }
    })();
  }, [go]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      let v: View = (e.state?.view as View) || 'site';
      cur.current = e.state?.i ?? 0;
      while (!can(v)) v = PREV[v];
      render(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [can, render]);

  if (loadErr) return <Shell tech={tech} onEdit={() => {}}><section className="section"><h2>Something went wrong</h2><p className="body-sm">{loadErr}</p><button className="btn-primary" type="button" onClick={() => location.reload()}>Try again</button></section></Shell>;
  if (!reg || !view) return <Shell tech={tech} onEdit={() => {}}><section className="section"><p className="body-sm">Loading the site list.</p></section></Shell>;

  const screensAt = (s: Site) => reg.screens.filter(x => x.site === s.id).sort((a, b) => a.device.localeCompare(b.device));
  const whole = site ? isWholeSite(site, picked, reg.screens) : false;

  /* Step 1 */
  const TechView = () => {
    const editing = ready(tech);
    const [name, setName] = useState(tech.name);
    const [phone, setPhone] = useState(tech.phone);
    const [remember, setRemember] = useState(tech.remember !== false);
    const [err, setErr] = useState('');
    const save = () => {
      const n = name.trim(), p = nzMobile(phone);
      const e = !n ? 'Add your name.' : !p ? 'Enter an NZ mobile number, e.g. 021 123 4567.' : '';
      if (e) { setErr(e); return; }
      const t: Tech = { name: n, phone: p!, remember };
      setTech(t); latest.current = { ...latest.current, tech: t };
      if (remember) { local.set('hyperTech', t); session.del('hyperTech'); } else { session.set('hyperTech', t); local.del('hyperTech'); }
      if (editing) back(); else go('site');
    };
    return (
      <form className="section" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        {editing && <button className="btn-ghost btn-back" type="button" onClick={back}><IconBack />Back</button>}
        <h2>Your details</h2>
        <p className="body-sm">The desk uses your mobile to call you back on site.</p>
        <div className="field"><label htmlFor="t-name">Your name</label><input id="t-name" type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} aria-invalid={!!err && !name.trim()} /></div>
        <div className="field"><label htmlFor="t-phone">NZ mobile</label><input id="t-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="021 123 4567" value={phone} onChange={e => setPhone(e.target.value)} aria-invalid={!!err && !nzMobile(phone)} /></div>
        <label className="check single"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>Remember me on this phone<br /><span className="caption">Skips this step next time. Untick on a shared device.</span></span></label>
        {err && <p className="notice notice-p1" role="alert">{err}</p>}
        <button className="btn-primary" type="submit">{editing ? 'Save' : 'Find the site'}</button>
      </form>
    );
  };

  /* Step 2 */
  const SiteView = () => {
    const [q, setQ] = useState('');
    const [nearNote, setNearNote] = useState(false);
    const t = q.trim().toLowerCase();
    const counts = new Map<string, number>(); reg.screens.forEach(s => counts.set(s.site, (counts.get(s.site) || 0) + 1));
    const hits = (t ? reg.sites.filter(s => (s.name + ' ' + s.street + ' ' + s.region).toLowerCase().includes(t)) : reg.sites).slice(0, t ? 30 : 8);
    const pick = (s: Site) => {
      let p = picked, f = form;
      if (!site || site.id !== s.id) { p = []; f = blank(); setPicked(p); setForm(f); }
      setSite(s); latest.current = { ...latest.current, site: s, picked: p }; saveDraft(s, p, f); go('screens');
    };
    return (
      <section className="section">
        <h2>Which Mobil site are you at?</h2>
        <div className="field"><label htmlFor="q">Search by site, street or town</label><input id="q" type="search" placeholder="e.g. Kamo, Cameron Road, Tauranga" autoComplete="off" autoFocus value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="btn-ghost" type="button" onClick={() => setNearNote(true)}>Use my location</button>
        {nearNote && <p className="caption">Location sorting is coming. Search by name, street or town for now.</p>}
        <div className="rows" aria-live="polite">
          {hits.map(s => (
            <button key={s.id} className="row" type="button" onClick={() => pick(s)}>
              <div><div className="t">{s.name}</div><div className="m">{s.street}</div></div>
              <div className="end"><span className="m mono">{counts.get(s.id) || 0} screen{(counts.get(s.id) || 0) === 1 ? '' : 's'}</span></div>
            </button>
          ))}
          {t && !hits.length && <p className="caption" style={{ padding: '12px 16px' }}>No Mobil site matches. Check the spelling, or call the HYPER desk.</p>}
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
        <button className="btn-ghost btn-back" type="button" onClick={back}><IconBack />Change site</button>
        <div><div className="label">{s.region}</div><h2>{s.name}</h2><div className="caption">{s.street}</div></div>
        <div className="between">
          <div className="label">Which screens have the fault? {list.length} registered</div>
          {live.length >= 2 && <button className="btn-ghost" type="button" onClick={() => update(allLive ? [] : live.slice())}>{allLive ? 'Clear all' : `Select all ${live.length} live screens`}</button>}
        </div>
        <div className="rows">
          {list.map(x => (
            <button key={x.id} className="row" type="button" aria-pressed={sel(x.id)} onClick={() => toggle(x)}>
              <div><div className="t">{shortName(x)}</div><div className="m"><span className="mono">{x.code}</span>, {x.position}, {x.cms}</div></div>
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
        const res = await fetch('/api/tickets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tech: { name: tech.name, phone: tech.phone }, siteId: s.id, screenIds: picked.map(p => p.id), symptoms: f.symptoms, checks: f.checks, notes: f.notes, job: f.job, photos: f.photos }),
        });
        if (res.status === 401) { location.href = '/access'; return; }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setSendErr(json.error || "Couldn't send. Try again."); return; }
        setResult({ ...json, symptoms: f.symptoms, photos: f.photos.length, job: f.job });
        local.del('hyperDraft');
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
        {offCount > 0 && <p className="notice notice-warn">{offCount === 1 && picked.length === 1 ? 'Mobil has switched this screen off' : `${offCount} of these screens are switched off by Mobil`} until further notice. Only raise a fault if you were asked to work on {offCount === 1 ? 'it' : 'them'}.</p>}
        {whole && <p className="notice notice-p1">Whole site affected: raised as P1 Critical, one ticket per screen.</p>}
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
        <div className="field"><label htmlFor="job">Clarksons job number</label><input id="job" type="text" placeholder="Optional" value={f.job} onChange={e => setF({ job: e.target.value })} /></div>
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
        <p className="body-sm">The desk will triage remotely and call you on <span className="mono">{fmtPhone(tech.phone)}</span> if they need you on site.</p>
        <dl className="kv">
          <dt>{r.tickets.length === 1 ? 'Ticket' : 'Tickets'}</dt>
          <dd>{r.tickets.length === 1 ? r.tickets[0].name : <ul>{r.tickets.map(t => <li key={t.id}>{t.name} <span className="mono">{t.code}</span></li>)}</ul>}</dd>
          <dt>Site</dt><dd>{r.site}</dd>
          <dt>Priority</dt><dd>{p1 ? 'P1 Critical, whole site' : 'P2 High'}</dd>
          <dt>Symptom</dt><dd>{sym}</dd>
          <dt>Checks</dt><dd>All {CHECKS.length} done</dd>
          <dt>Photos</dt><dd>{r.photos ? `${r.photosAttached} of ${r.photos} attached` : 'None'}</dd>
          {r.job && <><dt>Job number</dt><dd>{r.job}</dd></>}
        </dl>
        {linked.length > 0 && <p className="caption">The desk already had an open ticket for {linked.length === 1 ? 'this screen' : `${linked.length} of these screens`}. Your report is linked to it, so nothing is lost.</p>}
        <div className="actions">
          <button className="btn-primary" type="button" onClick={() => { saveDraft(site, [], blank()); go('screens'); }}>Raise another at this site</button>
          <button className="btn-secondary" type="button" onClick={() => { setSite(null); latest.current = { ...latest.current, site: null }; local.del('hyperDraft'); go('site'); }}>New site</button>
        </div>
      </section>
    );
  };

  const stepOf: Record<View, number> = { tech: 1, site: 2, screens: 3, form: 4, done: 4 };
  return (
    <Shell tech={tech} step={stepOf[view]} onEdit={() => go('tech')}>
      {view === 'tech' && <TechView />}
      {view === 'site' && <SiteView />}
      {view === 'screens' && site && <ScreensView />}
      {view === 'form' && site && picked.length > 0 && <FormView />}
      {view === 'done' && result && <DoneView />}
    </Shell>
  );
}

function Shell({ tech, step = 0, onEdit, children }: { tech: Tech; step?: number; onEdit: () => void; children: React.ReactNode }) {
  const named = !!(tech.name && nzMobile(tech.phone));
  return (
    <div className="wrap">
      <div className="top">
        <Logo />
        {named && <span className="who"><span>{tech.name}, Clarksons</span><button className="btn-ghost" type="button" onClick={onEdit}>Edit</button></span>}
      </div>
      <div className="section" style={{ gap: 'var(--space-sm)' }}>
        <div className="label">Field support, Mobil</div>
        <h1 className="title">Raise a screen fault</h1>
      </div>
      <div className="steps" aria-hidden="true">{[1, 2, 3, 4].map(i => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
      <main>{children}</main>
      <footer>HYPER Network Operations</footer>
    </div>
  );
}
