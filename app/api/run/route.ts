import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';
import { dashboardUrl } from '@/lib/siteUrl';

// Scheduled run. Vercel cron calls this (GET) on Monday and Thursday at
// 7:00 am India time, sending "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runPipeline('cron', dashboardUrl(req));
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[api/run]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
