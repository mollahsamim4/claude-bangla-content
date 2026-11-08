import { parseApi } from './parse-api';
import { parseClaudeCode } from './parse-claude-code';
import { parseHelpCenter } from './parse-help-center';

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

export const FETCH_TIMEOUT_MS = 30_000;
/** Sanity limit: the largest source (Claude Code changelog) is well under 2 MB. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export async function fetchSourceText(
  source: Source,
  fetchImpl: typeof fetch = fetch,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string> {
  const maxBytes = opts.maxBytes ?? MAX_SOURCE_BYTES;
  const res = await fetchImpl(source.fetchUrl, {
    headers: { 'user-agent': 'claude-bangla-content-bot' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${source.id}: fetching ${source.fetchUrl} failed with HTTP ${res.status}`);
  const tooLarge = () => new Error(`${source.id}: response too large (limit ${maxBytes} bytes)`);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw tooLarge();
  return text.replace(/\r\n/g, '\n');
}

export type FeedSource = 'claude-code' | 'claude-api' | 'help-center';

export interface SourceEntry {
  source: Source;
  parse: (markdown: string) => RawItem[];
  /** Value of FeedItem.source for items from this source. */
  feedSource: FeedSource;
}

/** SourceId -> everything the runner needs. (Parsers are wrapped so the import cycle is harmless.) */
export const REGISTRY: Record<SourceId, SourceEntry> = {
  'claude-code': { source: SOURCES.claudeCode, parse: (md) => parseClaudeCode(md), feedSource: 'claude-code' },
  'claude-api': { source: SOURCES.api, parse: (md) => parseApi(md), feedSource: 'claude-api' },
  'help-center': { source: SOURCES.helpCenter, parse: (md) => parseHelpCenter(md), feedSource: 'help-center' },
};

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
