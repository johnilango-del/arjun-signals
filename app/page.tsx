import { getSupabase } from '@/lib/supabase';
import { formatDate, formatDateTime, isWarm, scoreTone, statusLabel, triggerNames } from '@/lib/format';
import type { Account, RunLog } from '@/lib/types';
import RunNowButton from './RunNowButton';

// Always read fresh data. The page is public (no password) and read-only:
// it has no way to edit anything.
export const dynamic = 'force-dynamic';

async function loadData(): Promise<{ accounts: Account[]; runs: RunLog[]; error?: string }> {
  try {
    const db = getSupabase();
    const [acc, runs] = await Promise.all([
      db.from('accounts').select('*').order('signal_score', { ascending: false }).order('company_name'),
      db.from('run_log').select('*').order('started_at', { ascending: false }).limit(8),
    ]);
    if (acc.error) throw new Error(acc.error.message);
    if (runs.error) throw new Error(runs.error.message);
    return { accounts: (acc.data ?? []) as Account[], runs: (runs.data ?? []) as RunLog[] };
  } catch (err) {
    return { accounts: [], runs: [], error: err instanceof Error ? err.message : String(err) };
  }
}

function safeUrl(u: string | null): string | null {
  return u && /^https?:\/\//i.test(u) ? u : null;
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className={`score score-${scoreTone(score)}`} aria-label={`Signal score ${score} out of 10`}>
      <span className="score-num">{score}</span>
      <span className="score-of">/10</span>
    </div>
  );
}

function AccountRow({ a, rank, warm }: { a: Account; rank: number; warm: boolean }) {
  const url = safeUrl(a.source_url);
  const triggers = triggerNames(a.trigger_types);
  return (
    <li className={`account ${warm ? 'is-warm' : ''}`}>
      <div className="account-main">
        <div className="account-head">
          <ScoreBadge score={a.signal_score ?? 0} />
          <div className="account-title">
            <h3>
              <span className="rank">{rank}.</span> {a.company_name}
              {warm && <span className="tag-warm">Warm</span>}
            </h3>
            <p className="meta">
              {a.segment} · {a.stage}
              {triggers.length > 0 && <> · {triggers.join(', ')}</>}
            </p>
          </div>
        </div>

        {a.signal_summary && (
          <div className="field">
            <span className="label">What changed</span>
            <p>{a.signal_summary}</p>
          </div>
        )}
        {a.outreach_angle && (
          <div className="field">
            <span className="label">Outreach angle</span>
            <p>{a.outreach_angle}</p>
          </div>
        )}
        {(url || a.source_title) && (
          <div className="field">
            <span className="label">Source</span>
            <p>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">{a.source_title || url}</a>
              ) : (
                a.source_title
              )}
            </p>
          </div>
        )}

        <p className="status-line">
          <span className={`status status-${a.check_status ?? 'none'}`}>{statusLabel(a.check_status)}</span>
          Last checked {formatDateTime(a.last_checked_at)}
          {a.signal_found_at && <> · Signal found {formatDateTime(a.signal_found_at)}</>}
        </p>
      </div>

      <aside className="notes" aria-label="Arjun's notes, read-only">
        <h4>Your notes (never changed by the system)</h4>
        <dl>
          <dt>Notes</dt>
          <dd>{a.arjun_notes || '—'}</dd>
          <dt>Last contact</dt>
          <dd>{formatDate(a.last_contact_date)}</dd>
          <dt>Relationship read</dt>
          <dd>{a.relationship_read || '—'}</dd>
        </dl>
      </aside>
    </li>
  );
}

export default async function Home() {
  const { accounts, runs, error } = await loadData();
  const now = Date.now();
  const warmCount = accounts.filter((a) => isWarm(a, now)).length;
  const lastRun = runs[0];

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Warm List: Pulse Monitor</h1>
          <p className="subtitle">Account signals for Arjun, checked every Monday and Thursday</p>
          <p className="muted small">
            Last run: {lastRun ? `${formatDateTime(lastRun.started_at)} (${lastRun.triggered_by === 'cron' ? 'scheduled' : 'manual'})` : 'No runs yet'}
          </p>
        </div>
        <RunNowButton />
      </header>

      {error && (
        <div className="alert">
          Couldn't load data from the database. Check that the Supabase environment variables are set in Vercel and that
          schema.sql has been run. <span className="muted">({error})</span>
        </div>
      )}

      {!error && (
        <section className="summary">
          <div className="stat">
            <span className="stat-num">{warmCount}</span>
            <span className="stat-label">warm accounts (signal in last 3 days)</span>
          </div>
          <div className="stat">
            <span className="stat-num">{accounts.length}</span>
            <span className="stat-label">accounts monitored</span>
          </div>
          <p className="muted small summary-note">
            Suggestions only. Check each source before reaching out. Arjun decides.
          </p>
        </section>
      )}

      <section>
        <h2>Accounts, ranked by signal score</h2>
        <ol className="accounts">
          {accounts.map((a, i) => (
            <AccountRow key={a.id} a={a} rank={i + 1} warm={isWarm(a, now)} />
          ))}
        </ol>
      </section>

      <section>
        <h2>Recent runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="runs">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Stories found</th>
                  <th>Signals found</th>
                  <th>Failures</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.started_at)}</td>
                    <td>{r.triggered_by === 'cron' ? 'Scheduled' : 'Manual'}</td>
                    <td>{r.finished_at ? r.stories_found : '…'}</td>
                    <td>{r.finished_at ? r.signals_found : '…'}</td>
                    <td>
                      {!r.finished_at
                        ? 'Running or interrupted'
                        : r.failures && r.failures.length > 0
                          ? r.failures.map((f) => f.company).join(', ')
                          : 'None'}
                    </td>
                    <td>{r.email_sent ? 'Sent' : r.finished_at ? 'Not sent' : '…'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="muted small foot">
        The system only finds signals and suggests. It never contacts prospects and never edits Arjun's notes.
      </footer>
    </main>
  );
}
