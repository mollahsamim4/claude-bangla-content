export type SourceId = 'claude-code' | 'claude-api' | 'help-center';

export interface RawItem {
  id: string;
  source: SourceId;
  title: string;
  /** ISO date (YYYY-MM-DD). Absent for Claude Code (the changelog has no dates). */
  date?: string;
  /** Claude Code only. */
  version?: string;
  englishText: string;
  url: string;
}

export interface Source {
  id: SourceId;
  /** Where the text is fetched from (a markdown variant, not the HTML page). */
  fetchUrl: string;
  /** Link shown to readers / put in the feed item. */
  pageUrl: string;
}

export const SOURCES = {
  claudeCode: {
    id: 'claude-code',
    fetchUrl: 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md',
    pageUrl: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  },
  api: {
    id: 'claude-api',
    fetchUrl: 'https://platform.claude.com/docs/en/release-notes/api.md',
    pageUrl: 'https://platform.claude.com/docs/en/release-notes/overview',
  },
  helpCenter: {
    id: 'help-center',
    fetchUrl: 'https://support.claude.com/en/articles/12138966-release-notes.md',
    pageUrl: 'https://support.claude.com/en/articles/12138966-release-notes',
  },
} as const satisfies Record<string, Source>;

export async function fetchSourceText(source: Source, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(source.fetchUrl, { headers: { 'user-agent': 'claude-bangla-content-bot' } });
  if (!res.ok) throw new Error(`${source.id}: fetching ${source.fetchUrl} failed with HTTP ${res.status}`);
  return (await res.text()).replace(/\r\n/g, '\n');
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** "November 5, 2026" -> "2026-11-05"; null if not a valid date. */
export function parseLongDate(text: string): string | null {
  const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const day = Number(m[2]);
  if (month === 0 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(Number(m[3]), month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${d}, ${y}`;
}

export function slugify(text: string, max = 60): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
  return s || 'entry';
}
