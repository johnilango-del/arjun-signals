import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';
import { getSupabase } from '@/lib/supabase';
import { dashboardUrl } from '@/lib/siteUrl';

// Manual run from the dashboard's "Check now and email me" button.
// Uses no secret from the browser; abuse is limited by the 5-minute rule.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const COOLDOWN_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { data: recent, error } = await getSupabase()
      .from('run_log')
      .select('started_at')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`Could not read run log: ${error.message}`);

    if (recent && recent.length > 0) {
      const waitMs = new Date(recent[0].started_at).getTime() + COOLDOWN_MS - Date.now();
      const mins = Math.max(1, Math.ceil(waitMs / 60000));
      return NextResponse.json(
        {
          ok: false,
          message: `A check ran just a moment ago, so the list is already fresh. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
        },
        { status: 429 }
      );
    }

    const s = await runPipeline('manual', dashboardUrl(req));
    const parts = [
      `Checked ${s.accountsChecked} accounts: ${s.storiesFound} new stories, ${s.signalsFound} with a signal.`,
      s.failures.length ? `${s.failures.length} couldn't be checked.` : '',
      s.emailSent ? 'Hot List emailed.' : `The email couldn't be sent${s.emailError ? ` (${s.emailError})` : ''}.`,
    ].filter(Boolean);
    return NextResponse.json({ ok: true, message: parts.join(' ') });
  } catch (err) {
    console.error('[api/run-now]', err);
    return NextResponse.json(
      { ok: false, message: 'Something went wrong while checking. Please try again in a few minutes.' },
      { status: 500 }
    );
  }
}
