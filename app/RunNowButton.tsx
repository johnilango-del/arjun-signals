'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Calls /api/run-now. No secrets live here: the server route does the work.
export default function RunNowButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/run-now', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setResult({
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? 'Done.' : 'Something went wrong. Please try again in a few minutes.'),
      });
      router.refresh();
    } catch {
      setResult({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="run-now">
      <button className="btn" onClick={run} disabled={loading}>
        {loading ? <><span className="spinner" aria-hidden /> Checking all accounts…</> : 'Check now and email me'}
      </button>
      {loading && <p className="run-msg muted">This takes up to a minute. Keep this page open.</p>}
      {result && <p className={`run-msg ${result.ok ? 'good' : 'bad'}`} role="status">{result.message}</p>}
    </div>
  );
}
