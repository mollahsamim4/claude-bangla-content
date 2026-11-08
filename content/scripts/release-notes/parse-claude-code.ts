import { SOURCES, type RawItem } from './sources';

/** `## <version>` headings, newest first; the body is the bullet list below. One item per version. */
export function parseClaudeCode(markdown: string): RawItem[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const items: RawItem[] = [];
  const seen = new Set<string>();
  let cur: { version: string; body: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const englishText = cur.body.join('\n').trim();
    if (englishText && !seen.has(cur.version)) {
      seen.add(cur.version);
      items.push({
        id: `claude-code-${cur.version}`,
        source: 'claude-code',
        title: `Claude Code ${cur.version}`,
        version: cur.version,
        englishText,
        url: SOURCES.claudeCode.pageUrl,
      });
    }
    cur = null;
  };
  for (const line of lines) {
    const h = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (h) {
      flush();
      cur = { version: h[1], body: [] };
    } else if (/^#{1,2} /.test(line)) {
      flush();
    } else if (cur) {
      cur.body.push(line);
    }
  }
  flush();
  if (items.length === 0) throw new Error('claude-code: parsed zero entries (changelog format changed?)');
  return items;
}
