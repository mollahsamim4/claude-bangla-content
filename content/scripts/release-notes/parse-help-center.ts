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
  let sectionText = 0;
  let sectionEntries = 0;
  let orphanLines = 0;
  const flush = () => {
    if (cur && date) {
      const englishText = cur.body.join('\n').replace(/\n-{3,}\s*$/, '').trim();
      if (!englishText) {
        console.warn(`help-center: entry "${cur.title}" in section ${date} has a title but no body; skipped`);
      } else {
        sectionEntries++;
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
  const endSection = () => {
    flush();
    if (date && sectionText > 0 && sectionEntries === 0) {
      console.warn(`help-center: section ${date} has text but no recognizable entry (bold title line); skipped`);
    } else if (date && orphanLines > 0) {
      console.warn(`help-center: section ${date} has ${orphanLines} text line(s) outside any entry (before the first title); ignored`);
    }
    sectionText = 0;
    sectionEntries = 0;
    orphanLines = 0;
  };
  for (const line of lines) {
    const h3 = /^### (.+?)\s*$/.exec(line);
    if (h3) {
      endSection();
      date = parseLongDate(h3[1]);
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      endSection();
      date = null;
      continue;
    }
    if (!date) continue;
    if (line.trim() && !/^-{3,}\s*$/.test(line.trim())) sectionText++;
    const t = /^\*\*([^*[].*?)\*\*\s*$/.exec(line);
    if (t) {
      flush();
      cur = { title: t[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else if (line.trim() && !/^-{3,}\s*$/.test(line.trim())) {
      orphanLines++;
    }
  }
  endSection();
  if (items.length === 0) throw new Error('help-center: parsed zero entries (release-notes format changed?)');
  return items;
}
