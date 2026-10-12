-- Warm List: Pulse Monitor - database schema
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once.

-- =====================================================================
-- 1. accounts
-- =====================================================================
create table if not exists public.accounts (
  id                 bigint generated always as identity primary key,

  -- ---- Arjun's columns. The system may READ these but NEVER write them. ----
  company_name       text not null unique,
  segment            text not null check (segment in ('Enterprise', 'Mid-market')),
  stage              text not null check (stage in ('Initial outreach', 'Live pilot', 'Signed customer, expanding')),
  search_phrase      text not null,
  arjun_notes        text,
  last_contact_date  date,
  relationship_read  text,

  -- ---- Signal columns. The ONLY columns the system may write. ----
  signal_score       integer not null default 0 check (signal_score between 0 and 10),
  trigger_types      jsonb not null default '[]'::jsonb,
  signal_summary     text,
  outreach_angle     text,
  source_url         text,
  source_title       text,
  signal_found_at    timestamptz,
  last_checked_at    timestamptz,
  check_status       text check (check_status in ('ok', 'no_news', 'failed'))
);

-- =====================================================================
-- 2. seen_stories (so the same story is never scored twice)
-- =====================================================================
create table if not exists public.seen_stories (
  id             bigint generated always as identity primary key,
  account_id     bigint not null references public.accounts(id) on delete cascade,
  story_key      text not null,
  first_seen_at  timestamptz not null default now(),
  unique (account_id, story_key)
);

-- =====================================================================
-- 3. run_log (one row per run)
-- =====================================================================
create table if not exists public.run_log (
  id                bigint generated always as identity primary key,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  triggered_by      text not null check (triggered_by in ('cron', 'manual')),
  accounts_checked  integer not null default 0,
  stories_found     integer not null default 0,
  signals_found     integer not null default 0,
  failures          jsonb not null default '[]'::jsonb,
  email_sent        boolean not null default false,
  notes             text
);

create index if not exists run_log_started_at_idx on public.run_log (started_at desc);

-- =====================================================================
-- Security: Row Level Security on, with no public policies.
-- Only the server (using the secret key) can read or write these tables.
-- =====================================================================
alter table public.accounts     enable row level security;
alter table public.seen_stories enable row level security;
alter table public.run_log      enable row level security;

-- =====================================================================
-- Second safety net for Arjun's columns (the first is lib/writeSignals.ts).
-- If the app (which connects as service_role via the secret key) ever tries
-- to change one of Arjun's columns, the database refuses the update.
-- Arjun editing his own rows in the Supabase Table Editor is not affected.
-- =====================================================================
create or replace function public.protect_arjun_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'service_role' and (
       new.company_name      is distinct from old.company_name
    or new.segment           is distinct from old.segment
    or new.stage             is distinct from old.stage
    or new.search_phrase     is distinct from old.search_phrase
    or new.arjun_notes       is distinct from old.arjun_notes
    or new.last_contact_date is distinct from old.last_contact_date
    or new.relationship_read is distinct from old.relationship_read
  ) then
    raise exception 'Arjun''s columns are protected: the system may only write signal columns';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_arjun_columns on public.accounts;
create trigger protect_arjun_columns
  before update on public.accounts
  for each row execute function public.protect_arjun_columns();

-- =====================================================================
-- Arjun's 10 accounts (notes are fictional, for the demo)
-- =====================================================================
insert into public.accounts
  (company_name, search_phrase, segment, stage, arjun_notes, last_contact_date, relationship_read)
values
  ('Swiggy', 'Swiggy', 'Enterprise', 'Signed customer, expanding',
   'Live in 3 cities for Instamart dark-store rostering. Ops team wants Pune and Hyderabad next. Procurement slow but friendly.',
   current_date - 9,
   'Strong. Ops head is a real champion; finance still needs the cost-per-shift story.'),
  ('Delhivery', 'Delhivery', 'Enterprise', 'Live pilot',
   'Pilot at two Gurugram hubs since August. Attendance accuracy up, but they want biometric integration before scaling.',
   current_date - 16,
   'Warm but cautious. Need hard pilot numbers before the quarterly review.'),
  ('Apollo Hospitals', 'Apollo Hospitals', 'Enterprise', 'Live pilot',
   'Nursing rosters pilot at one Chennai hospital. Night-shift swaps were the big pain. HR asked about overtime compliance reports.',
   current_date - 21,
   'Good. Nursing superintendent likes it; central HR hasn''t engaged yet.'),
  ('Lenskart', 'Lenskart', 'Enterprise', 'Initial outreach',
   'Met their retail ops lead at a Bengaluru HR meetup. Store staffing is spreadsheet-heavy. Sent a short deck, no reply yet.',
   current_date - 34,
   'Cold-ish. Interested in the problem, not yet in us.'),
  ('DMart', 'DMart Avenue Supermarts', 'Enterprise', 'Initial outreach',
   'Very process-driven, builds a lot in-house. One intro call with an IT manager, not ops. Need a way into store operations.',
   current_date - 52,
   'Long shot. Respectful but not looking right now.'),
  ('Licious', 'Licious', 'Mid-market', 'Signed customer, expanding',
   'Using us for processing-centre shifts in Bengaluru. Talking about adding delivery riders in Q4. Renewal due in March.',
   current_date - 6,
   'Very good. Quick decisions, happy with support.'),
  ('Shadowfax', 'Shadowfax logistics', 'Mid-market', 'Live pilot',
   'Pilot with rider attendance in Mumbai. Geo-fencing works, but riders found the app login clunky. Fix shipped last week.',
   current_date - 12,
   'Okay. Pilot is fine, but they compare everything on price.'),
  ('Lemon Tree Hotels', 'Lemon Tree Hotels', 'Mid-market', 'Initial outreach',
   'Housekeeping and front-desk shifts across many properties. Spoke briefly to a regional HR manager at a hospitality event.',
   current_date - 41,
   'Early. Friendly, but no clear owner for workforce tools yet.'),
  ('Wakefit', 'Wakefit', 'Mid-market', 'Initial outreach',
   'Factory plus experience stores. Cold email got a "maybe later" from the HR head in July.',
   current_date - 58,
   'Lukewarm. Timing more than fit.'),
  ('Country Delight', 'Country Delight', 'Mid-market', 'Initial outreach',
   'Early-morning delivery shifts are a nightmare for them, per a mutual contact. Haven''t spoken to anyone senior yet.',
   current_date - 27,
   'Promising on paper. Need a warm intro to the COO''s team.')
on conflict (company_name) do nothing;
