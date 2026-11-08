import { parseLongDate, slugify, SOURCES, type RawItem } from './sources';

/**
 * `## Month YYYY` -> `### Month D, YYYY` -> entries that start with a whole-line bold title
 * (`**Title**`). One item per entry; id `help-<date>-<slug>`.
 */
export function parseHelpCenter(markdown: string): RawItem[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const items: RawItem[] = [];
  const usedIds = new Set<string>();
  let date: string | null = null;
  let cur: { title: string; body: string[] } | null = null;
  const flush = () => {
    if (cur && date) {
      const englishText = cur.body.join('\n').replace(/\n-{3,}\s*$/, '').trim();
      if (englishText) {
        const base = `help-${date}-${slugify(cur.title)}`;
        let id = base;
        for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
        usedIds.add(id);
        items.push({
          id,
          source: 'help-center',
          title: cur.title,
          date,
          englishText,
          url: SOURCES.helpCenter.pageUrl,
        });
      }
    }
    cur = null;
  };
  for (const line of lines) {
    const h3 = /^### (.+?)\s*$/.exec(line);
    if (h3) {
      flush();
      date = parseLongDate(h3[1]);
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      flush();
      date = null;
      continue;
    }
    if (!date) continue;
    const t = /^\*\*([^*[].*?)\*\*\s*$/.exec(line);
    if (t) {
      flush();
      cur = { title: t[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  flush();
  if (items.length === 0) throw new Error('help-center: parsed zero entries (release-notes format changed?)');
  return items;
}
