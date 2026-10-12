export type CheckStatus = 'ok' | 'no_news' | 'failed';

// Full account row (used read-only by the dashboard).
export interface Account {
  id: number;
  company_name: string;
  segment: string;
  stage: string;
  search_phrase: string;
  arjun_notes: string | null;
  last_contact_date: string | null;
  relationship_read: string | null;
  signal_score: number;
  trigger_types: string[] | null;
  signal_summary: string | null;
  outreach_angle: string | null;
  source_url: string | null;
  source_title: string | null;
  signal_found_at: string | null;
  last_checked_at: string | null;
  check_status: CheckStatus | null;
}

export interface RunLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  triggered_by: 'cron' | 'manual';
  accounts_checked: number;
  stories_found: number;
  signals_found: number;
  failures: { company: string; error: string }[] | null;
  email_sent: boolean;
  notes: string | null;
}

export interface Story {
  title: string;
  link: string;
  source: string;
  published: string; // ISO date
  snippet: string;
  key: string; // hash used in seen_stories
}
