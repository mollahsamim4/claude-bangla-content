import { formatLongDate, parseLongDate, SOURCES, type RawItem } from './sources';

/** `### Month D, YYYY` headings, newest first. One item per date; repeated dates are merged. */
export function parseApi(markdown: string): RawItem[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const byDate = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const line of lines) {
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) {
      const iso = parseLongDate(h[1]);
      if (iso) {
        const existing = byDate.get(iso);
        if (existing) {
          existing.push('');
          cur = existing;
        } else {
          cur = [];
          byDate.set(iso, cur);
        }
        continue;
      }
    }
    if (/^#{1,3} /.test(line)) cur = null;
    else if (cur) cur.push(line);
  }
  const items: RawItem[] = [];
  for (const [date, body] of byDate) {
    const englishText = body.join('\n').trim();
    if (!englishText) continue;
    items.push({
      id: `api-${date}`,
      source: 'claude-api',
      title: `Claude API — ${formatLongDate(date)}`,
      date,
      englishText,
      url: SOURCES.api.pageUrl,
    });
  }
  if (items.length === 0) throw new Error('claude-api: parsed zero entries (release-notes format changed?)');
  return items;
}
