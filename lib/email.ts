import { getSupabase } from './supabase';
import { emailDate, isWarm, scoreTone, triggerNames } from './format';

// The ONLY email this system ever sends: the Hot List, to Arjun.
// It never contacts a prospect.

interface EmailAccount {
  company_name: string;
  segment: string;
  stage: string;
  signal_score: number;
  trigger_types: string[] | null;
  signal_summary: string | null;
  outreach_angle: string | null;
  source_url: string | null;
  source_title: string | null;
  signal_found_at: string | null;
  check_status: string | null;
}

const BADGE: Record<string, { bg: string; fg: string }> = {
  hot: { bg: '#fde2e1', fg: '#b42318' },
  warm: { bg: '#fef0c7', fg: '#93370d' },
  low: { bg: '#eef0f3', fg: '#475467' },
  none: { bg: '#eef0f3', fg: '#475467' },
};

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(u: string | null | undefined): string {
  return u && /^https?:\/\//i.test(u) ? u : '';
}

function badge(score: number): string {
  const c = BADGE[scoreTone(score)];
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${c.bg};color:${c.fg};font-weight:700;font-size:14px;">${score}/10</span>`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function buildHotList(accounts: EmailAccount[], dashboardUrl: string) {
  const now = Date.now();
  const warm = accounts
    .filter((a) => isWarm(a, now))
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 10);
  const warmNames = new Set(warm.map((a) => a.company_name));
  const failed = accounts.filter((a) => a.check_status === 'failed');
  const quiet = accounts
    .filter((a) => !warmNames.has(a.company_name) && a.check_status !== 'failed')
    .sort((a, b) => b.signal_score - a.signal_score);

  const n = warm.length;
  const total = accounts.length;
  const subject = `Hot List, ${emailDate()}: ${plural(n, 'warm account')} this week`;

  const opening =
    n > 0
      ? `Morning Arjun. ${n} of your ${total} accounts had a relevant signal in the last 3 days. Check each source before you reach out.`
      : `Morning Arjun. It's a quiet week: none of your ${total} accounts had a relevant signal in the last 3 days. Nothing needs chasing from this list today.`;

  const label = 'font-size:12px;font-weight:700;color:#475467;text-transform:uppercase;letter-spacing:0.04em;';

  const warmHtml = warm
    .map((a, i) => {
      const meta = [a.segment, a.stage, ...triggerNames(a.trigger_types)].map(esc).join(' &middot; ');
      const url = safeUrl(a.source_url);
      const source = url
        ? `<a href="${esc(url)}" style="color:#3b4fd8;">${esc(a.source_title || url)}</a>`
        : esc(a.source_title || 'No link');
      return `
      <tr><td style="padding:18px 0;border-top:1px solid #e4e7ec;">
        <div style="font-size:18px;font-weight:700;color:#101828;">${i + 1}. ${esc(a.company_name)} &nbsp;${badge(a.signal_score)}</div>
        <div style="font-size:13px;color:#667085;margin-top:4px;">${meta}</div>
        <div style="margin-top:12px;"><span style="${label}">What changed:</span><br>${esc(a.signal_summary)}</div>
        <div style="margin-top:10px;"><span style="${label}">Outreach angle:</span><br>${esc(a.outreach_angle)}</div>
        <div style="margin-top:10px;font-size:14px;"><span style="${label}">Source:</span> ${source}</div>
      </td></tr>`;
    })
    .join('');

  const quietLine = quiet.length
    ? quiet.map((a) => `${esc(a.company_name)} ${a.signal_score}`).join(' &middot; ')
    : 'None';

  const failedHtml = failed.length
    ? `<h2 style="font-size:15px;margin:24px 0 6px;color:#101828;">Couldn't check</h2>
       <p style="margin:0;color:#475467;font-size:14px;">${failed.map((a) => esc(a.company_name)).join(', ')}. These will be tried again on the next run.</p>`
    : '';

  const dash = safeUrl(dashboardUrl);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#344054;">
  <tr><td style="font-size:12px;font-weight:700;color:#3b4fd8;letter-spacing:0.04em;padding-bottom:16px;">Warm List: Pulse Monitor</td></tr>
  <tr><td style="font-size:16px;color:#101828;padding-bottom:12px;">${esc(opening)}</td></tr>
  ${warmHtml}
  <tr><td style="border-top:1px solid #e4e7ec;padding-top:4px;">
    <h2 style="font-size:15px;margin:20px 0 6px;color:#101828;">Quiet this week</h2>
    <p style="margin:0;color:#475467;font-size:14px;">${quietLine}</p>
    ${failedHtml}
  </td></tr>
  <tr><td style="padding-top:28px;font-size:13px;color:#667085;">
    Suggestions only. Your notes and last-contact dates weren't changed. Full list on your ${dash ? `<a href="${esc(dash)}" style="color:#3b4fd8;">dashboard</a>` : 'dashboard'}.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    'Warm List: Pulse Monitor',
    '',
    opening,
    '',
    ...warm.flatMap((a, i) => [
      `${i + 1}. ${a.company_name} (${a.signal_score}/10)`,
      [a.segment, a.stage, ...triggerNames(a.trigger_types)].join(' · '),
      `What changed: ${a.signal_summary ?? ''}`,
      `Outreach angle: ${a.outreach_angle ?? ''}`,
      `Source: ${a.source_title ?? ''} ${a.source_url ?? ''}`,
      '',
    ]),
    `Quiet this week: ${quiet.map((a) => `${a.company_name} ${a.signal_score}`).join(' · ') || 'None'}`,
    ...(failed.length ? ['', `Couldn't check: ${failed.map((a) => a.company_name).join(', ')}`] : []),
    '',
    `Suggestions only. Your notes and last-contact dates weren't changed. Full list on your dashboard: ${dash}`,
  ].join('\n');

  return { subject, html, text };
}

export async function sendHotList(dashboardUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TEST_RECIPIENT;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  if (!to) throw new Error('EMAIL_TEST_RECIPIENT is not set');

  const { data, error } = await getSupabase()
    .from('accounts')
    .select('company_name, segment, stage, signal_score, trigger_types, signal_summary, outreach_angle, source_url, source_title, signal_found_at, check_status');
  if (error) throw new Error(`Could not load accounts for email: ${error.message}`);

  const { subject, html, text } = buildHotList((data ?? []) as EmailAccount[], dashboardUrl);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
    body: JSON.stringify({
      from: 'Warm List <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}
