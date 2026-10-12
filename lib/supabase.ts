import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client. Uses the SECRET key, so never import this
// from a 'use client' component.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is not set');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
