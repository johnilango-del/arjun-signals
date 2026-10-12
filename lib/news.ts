import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { Story } from './types';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_STORIES = 10;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  htmlEntities: true,
});

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  return typeof v === 'object' ? '' : String(v);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function storyKey(link: string, title: string): string {
  return createHash('sha256').update(link || title).digest('hex');
}

/** Fetch Google News RSS for one search phrase: last 3 days, max 10 newest. */
export async function fetchNews(searchPhrase: string, timeoutMs: number): Promise<Story[]> {
  const q = encodeURIComponent(searchPhrase);
  const url = `https://news.google.com/rss/search?q=${q}+when:3d&hl=en-IN&gl=IN&ceid=IN:en`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WarmListPulseMonitor/1.0)' },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Google News returned HTTP ${res.status}`);

  const xml = await res.text();
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item;
  const items: Record<string, unknown>[] = raw ? (Array.isArray(raw) ? raw : [raw]) : [];

  const cutoff = Date.now() - THREE_DAYS_MS;
  const stories: Story[] = [];

  for (const item of items) {
    const published = new Date(text(item.pubDate));
    if (isNaN(published.getTime()) || published.getTime() < cutoff) continue;

    const source = text(item.source);
    let title = stripHtml(text(item.title));
    // Google News appends " - Source Name" to titles; drop it.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const link = text(item.link).trim();
    if (!title) continue;
    // Google's description is often just the headline again; skip it then.
    let snippet = stripHtml(text(item.description)).slice(0, 400);
    if (snippet.startsWith(title)) snippet = '';

    stories.push({
      title,
      link,
      source,
      published: published.toISOString(),
      snippet,
      key: storyKey(link, title),
    });
  }

  stories.sort((a, b) => b.published.localeCompare(a.published));
  // Same story can appear twice in a feed; keep the first.
  const seen = new Set<string>();
  return stories.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true))).slice(0, MAX_STORIES);
}
