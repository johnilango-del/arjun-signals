// Small display helpers shared by the dashboard and the email.

export const TRIGGER_NAMES: Record<string, string> = {
  A: 'Headcount expansion',
  B: 'New people / ops leader',
  C: 'Workforce digitalisation',
  D: 'Funding / financial event',
  E: 'Operational challenge',
};

export function triggerNames(types: string[] | null | undefined): string[] {
  return (types ?? []).map((t) => TRIGGER_NAMES[t] ?? t);
}

export type ScoreTone = 'hot' | 'warm' | 'low' | 'none';

export function scoreTone(score: number): ScoreTone {
  if (score >= 8) return 'hot';
  if (score >= 5) return 'warm';
  if (score >= 1) return 'low';
  return 'none';
}

const TZ = 'Asia/Kolkata';

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso)) + ' IST';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  // Plain dates (YYYY-MM-DD) are shown as-is, without timezone shifting.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00Z') : new Date(iso);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

// "Monday 12 Oct" in India time, for the email subject.
export function emailDate(d: Date = new Date()): string {
  const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long' }).format(d);
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);
  return `${weekday} ${date}`;
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Warm = a signal found in the last 3 days with a score above 0.
export function isWarm(a: { signal_score: number; signal_found_at: string | null }, now = Date.now()): boolean {
  if (!a.signal_found_at || a.signal_score <= 0) return false;
  return now - new Date(a.signal_found_at).getTime() <= THREE_DAYS_MS;
}

export function statusLabel(s: string | null | undefined): string {
  if (s === 'ok') return 'Checked';
  if (s === 'no_news') return 'No new news';
  if (s === 'failed') return "Couldn't check";
  return 'Not checked yet';
}
