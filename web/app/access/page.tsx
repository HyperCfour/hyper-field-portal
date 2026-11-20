'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '../../components/Logo';

export default function AccessPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error || 'That code is not right.'); return; }
      router.replace('/');
    } catch {
      setErr("Couldn't reach the server. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="top"><Logo /></div>
      <div className="section" style={{ gap: 'var(--space-sm)' }}>
        <div className="label">Field support, Mobil</div>
        <h1 className="title">Enter the access code</h1>
      </div>
      <form className="section" onSubmit={submit}>
        <p className="body-sm">Clarksons technicians have this code from the HYPER desk. It is not your personal login.</p>
        <div className="field">
          <label htmlFor="code">Access code</label>
          <input id="code" type="password" autoComplete="off" inputMode="text" value={code} onChange={e => setCode(e.target.value)} aria-invalid={!!err} />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn-primary" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking' : 'Continue'}</button>
      </form>
      <footer>HYPER Network Operations</footer>
    </div>
  );
}
