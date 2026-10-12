import { getSupabase } from './supabase';
import { fetchNews } from './news';
import { scoreAccount } from './gemini';
import { writeSignals } from './writeSignals';
import { sendHotList } from './email';
import type { Story } from './types';

const BATCH_SIZE = 3;
// The route allows 60 seconds. Stop starting new work after this point so
// there is always time left to save the run log and send the email.
const ACCOUNT_BUDGET_MS = 48_000;
const NEWS_TIMEOUT_MS = 8_000;
const GEMINI_TIMEOUT_MS = 25_000;

// The pipeline only loads the columns it needs. Arjun's notes, last-contact
// date and relationship read are never loaded here, so they can never be
// sent to Gemini.
interface PipelineAccount {
  id: number;
  company_name: string;
  segment: string;
  stage: string;
  search_phrase: string;
  signal_score: number;
}

interface AccountResult {
  storiesFound: number;
  signalFound: boolean;
  error?: string;
}

export interface RunSummary {
  runId: number | null;
  accountsChecked: number;
  storiesFound: number;
  signalsFound: number;
  failures: { company: string; error: string }[];
  emailSent: boolean;
  emailError?: string;
}

function message(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'Timed out';
    return err.message;
  }
  return String(err);
}

async function processAccount(acc: PipelineAccount, deadline: number): Promise<AccountResult> {
  const db = getSupabase();
  const nowIso = () => new Date().toISOString();
  const previous = acc.signal_score ?? 0;
  const decayed = Math.floor(previous / 2);

  try {
    const timeLeft = () => deadline - Date.now();
    if (timeLeft() < 2_000) throw new Error('Skipped: ran out of time in this run');

    // 1. Fetch news (last 3 days, max 10 newest).
    const stories = await fetchNews(acc.search_phrase, Math.min(NEWS_TIMEOUT_MS, timeLeft()));

    // 2. Remove stories already seen for this account.
    let fresh: Story[] = stories;
    if (stories.length > 0) {
      const { data, error } = await db
        .from('seen_stories')
        .select('story_key')
        .eq('account_id', acc.id)
        .in('story_key', stories.map((s) => s.key));
      if (error) throw new Error(`Reading seen stories failed: ${error.message}`);
      const seen = new Set((data ?? []).map((r) => r.story_key as string));
      fresh = stories.filter((s) => !seen.has(s.key));
    }

    // 3. No new stories: the "going quiet" rule.
    if (fresh.length === 0) {
      await writeSignals(acc.id, {
        check_status: 'no_news',
        signal_score: decayed,
        last_checked_at: nowIso(),
      });
      return { storiesFound: 0, signalFound: false };
    }

    // 4. One Gemini call for this account.
    if (timeLeft() < 4_000) throw new Error('Skipped: ran out of time in this run');
    const verdict = await scoreAccount(
      { company_name: acc.company_name, segment: acc.segment, stage: acc.stage },
      fresh,
      Math.min(GEMINI_TIMEOUT_MS, timeLeft())
    );

    // Stories are marked as seen only after Gemini has judged them, so a
    // failed run doesn't lose them: they'll be retried next time.
    const { error: seenErr } = await db.from('seen_stories').upsert(
      fresh.map((s) => ({ account_id: acc.id, story_key: s.key })),
      { onConflict: 'account_id,story_key', ignoreDuplicates: true }
    );
    if (seenErr) console.warn(`[pipeline] Could not save seen stories for ${acc.company_name}: ${seenErr.message}`);

    // 5. Write the result.
    if (verdict.signal_score > 0) {
      const now = nowIso();
      await writeSignals(acc.id, {
        signal_score: Math.max(verdict.signal_score, decayed),
        trigger_types: verdict.trigger_types,
        signal_summary: verdict.signal_summary,
        outreach_angle: verdict.outreach_angle,
        source_url: verdict.source_url,
        source_title: verdict.source_title,
        signal_found_at: now,
        last_checked_at: now,
        check_status: 'ok',
      });
      return { storiesFound: fresh.length, signalFound: true };
    }

    // Gemini says nothing relevant: same as going quiet, but status ok.
    await writeSignals(acc.id, {
      check_status: 'ok',
      signal_score: decayed,
      last_checked_at: nowIso(),
    });
    return { storiesFound: fresh.length, signalFound: false };
  } catch (err) {
    // 6. Failure: mark failed, change nothing else.
    const error = message(err);
    console.error(`[pipeline] ${acc.company_name}: ${error}`);
    try {
      await writeSignals(acc.id, { check_status: 'failed', last_checked_at: nowIso() });
    } catch (writeErr) {
      console.error(`[pipeline] Could not mark ${acc.company_name} as failed: ${message(writeErr)}`);
    }
    return { storiesFound: 0, signalFound: false, error };
  }
}

/** One full run: check every account, log it, email the Hot List. */
export async function runPipeline(triggeredBy: 'cron' | 'manual', dashboardUrl: string): Promise<RunSummary> {
  const db = getSupabase();
  const started = Date.now();
  const deadline = started + ACCOUNT_BUDGET_MS;

  // Log the start right away so /api/run-now can see a run is in progress.
  const { data: runRow, error: runErr } = await db
    .from('run_log')
    .insert({ started_at: new Date(started).toISOString(), triggered_by: triggeredBy })
    .select('id')
    .single();
  if (runErr) console.error(`[pipeline] Could not create run log: ${runErr.message}`);
  const runId: number | null = runRow?.id ?? null;

  const { data: accounts, error: accErr } = await db
    .from('accounts')
    .select('id, company_name, segment, stage, search_phrase, signal_score')
    .order('id');
  if (accErr) throw new Error(`Could not load accounts: ${accErr.message}`);

  const list = (accounts ?? []) as PipelineAccount[];
  const failures: { company: string; error: string }[] = [];
  let storiesFound = 0;
  let signalsFound = 0;

  // Batches of 3 in parallel. allSettled means one failure never stops the rest.
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((a) => processAccount(a, deadline)));
    results.forEach((r, j) => {
      const company = batch[j].company_name;
      if (r.status === 'rejected') {
        failures.push({ company, error: message(r.reason) });
        return;
      }
      storiesFound += r.value.storiesFound;
      if (r.value.signalFound) signalsFound += 1;
      if (r.value.error) failures.push({ company, error: r.value.error });
    });
  }

  const summary: RunSummary = {
    runId,
    accountsChecked: list.length,
    storiesFound,
    signalsFound,
    failures,
    emailSent: false,
  };

  // Write the run log, then send the email.
  const finishRun = (extra: Record<string, unknown>) =>
    runId == null ? Promise.resolve() : db.from('run_log').update(extra).eq('id', runId).then(({ error }) => {
      if (error) console.error(`[pipeline] Could not update run log: ${error.message}`);
    });

  await finishRun({
    finished_at: new Date().toISOString(),
    accounts_checked: list.length,
    stories_found: storiesFound,
    signals_found: signalsFound,
    failures,
    notes: `${list.length - failures.length} of ${list.length} accounts checked successfully.`,
  });

  try {
    await sendHotList(dashboardUrl);
    summary.emailSent = true;
    await finishRun({ email_sent: true });
  } catch (err) {
    summary.emailError = message(err);
    console.error(`[pipeline] Hot List email failed: ${summary.emailError}`);
    await finishRun({
      notes: `${list.length - failures.length} of ${list.length} accounts checked successfully. Email failed: ${summary.emailError}`,
    });
  }

  return summary;
}
