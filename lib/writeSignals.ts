/**
 * ARJUN'S COLUMNS ARE PROTECTED BY DESIGN.
 *
 * This file is the ONLY place in the codebase allowed to update the
 * `accounts` table. It writes signal columns and nothing else.
 *
 * Arjun owns: company_name, segment, stage, search_phrase, arjun_notes,
 * last_contact_date, relationship_read. The system may read them, but it
 * must never write them. To guarantee that:
 *   1. Only keys in SIGNAL_COLUMNS below are ever sent to the database.
 *      Any other key is dropped and a warning is logged.
 *   2. We never upsert and never write a full row. We update only the
 *      allowlisted columns, for one row, matched by id.
 *   3. As a second safety net, a database trigger (supabase/schema.sql)
 *      rejects any change to Arjun's columns made by the app.
 *
 * If you need the system to write something new, add a NEW signal column.
 * Do not add any of Arjun's columns to this list.
 */
import { getSupabase } from './supabase';

const SIGNAL_COLUMNS = [
  'signal_score',
  'trigger_types',
  'signal_summary',
  'outreach_angle',
  'source_url',
  'source_title',
  'signal_found_at',
  'last_checked_at',
  'check_status',
] as const;

export type SignalColumn = (typeof SIGNAL_COLUMNS)[number];
export type SignalPatch = Partial<Record<SignalColumn, unknown>>;

const ALLOWED = new Set<string>(SIGNAL_COLUMNS);

export async function writeSignals(accountId: number, patch: Record<string, unknown>): Promise<void> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED.has(key)) {
      clean[key] = value;
    } else {
      console.warn(`[writeSignals] Dropped non-signal column "${key}" for account ${accountId}. Arjun's columns are never written.`);
    }
  }

  if (Object.keys(clean).length === 0) return;

  const { error } = await getSupabase().from('accounts').update(clean).eq('id', accountId);
  if (error) throw new Error(`Saving signals failed: ${error.message}`);
}
