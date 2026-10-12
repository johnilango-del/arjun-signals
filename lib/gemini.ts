import { SIGNAL_GUIDE } from './signalGuide';
import type { Story } from './types';

const MODEL = 'gemini-3.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface GeminiVerdict {
  signal_score: number;
  trigger_types: string[];
  signal_summary: string;
  outreach_angle: string;
  source_url: string;
  source_title: string;
}

// Only these account fields ever go to Gemini. Arjun's notes, last-contact
// date and relationship read are deliberately NOT part of this type.
export interface AccountForScoring {
  company_name: string;
  segment: string;
  stage: string;
}

function buildPrompt(account: AccountForScoring, stories: Story[]): string {
  const today = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
  }).format(new Date());

  const list = stories
    .map(
      (s, i) =>
        `Story ${i + 1}\nTitle: ${s.title}\nSource: ${s.source || 'Unknown'}\nPublished: ${s.published}\nLink: ${s.link}\nSnippet: ${s.snippet || '(none)'}`
    )
    .join('\n\n');

  return `Today is ${today} (India time).

ACCOUNT
Company: ${account.company_name}
Segment: ${account.segment}
Stage: ${account.stage}

NEW NEWS STORIES (last 3 days)
${list}

Judge these stories for ${account.company_name} exactly as the signal guide says.
For source_url and source_title, copy the Link and Title of the strongest story exactly as given above.
Reply ONLY with the JSON object described in section 6 of the signal guide.`;
}

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Gemini did not return valid JSON');
  }
}

/** Clean up Gemini's answer so only safe, expected values get written. */
function normalise(data: unknown, stories: Story[]): GeminiVerdict {
  const d = (data ?? {}) as Record<string, unknown>;
  const rawScore = Math.round(Number(d.signal_score));
  const score = Number.isFinite(rawScore) ? Math.min(10, Math.max(0, rawScore)) : 0;

  const types = Array.isArray(d.trigger_types)
    ? [...new Set(d.trigger_types.map((t) => String(t).trim().toUpperCase()).filter((t) => /^[A-E]$/.test(t)))]
    : [];

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  // The source must be one of the stories we actually sent, never a made-up link.
  const url = str(d.source_url);
  const title = str(d.source_title);
  const match =
    stories.find((s) => s.link && s.link === url) ??
    stories.find((s) => s.title.toLowerCase() === title.toLowerCase()) ??
    stories[0];

  if (score === 0) {
    return {
      signal_score: 0,
      trigger_types: [],
      signal_summary: 'No relevant signal in the last 3 days.',
      outreach_angle: '',
      source_url: '',
      source_title: '',
    };
  }

  return {
    signal_score: score,
    trigger_types: types,
    signal_summary: str(d.signal_summary),
    outreach_angle: str(d.outreach_angle),
    source_url: match?.link ?? '',
    source_title: match?.title ?? title,
  };
}

/** One Gemini call per account with new stories. */
export async function scoreAccount(
  account: AccountForScoring,
  stories: Story[],
  timeoutMs: number
): Promise<GeminiVerdict> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SIGNAL_GUIDE }] },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(account, stories) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const parts: { text?: string; thought?: boolean }[] = json?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!raw) throw new Error(`Gemini returned no text (finish reason: ${json?.candidates?.[0]?.finishReason ?? 'unknown'})`);

  return normalise(extractJson(raw), stories);
}
