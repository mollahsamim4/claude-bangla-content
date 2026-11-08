import type { RawItem, SourceId } from './sources';

export const WINDOW_DAYS = 14;
export const FIRST_RUN_CLAUDE_CODE = 3;
export const MAX_PER_RUN = 8;

const DAY_MS = 86_400_000;

function versionCmp(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Decide which parsed items to propose this run. Pure.
 * @param items     parser output (each source newest first)
 * @param knownIds  ids already in content/feed/ plus ids from PR branches `release-notes/<id>` (open, merged or closed)
 * @param now       current time
 */
export function detect(items: readonly RawItem[], knownIds: Iterable<string>, now: Date): RawItem[] {
  const known = new Set(knownIds);
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);

  const newestKnownVersion = [...known]
    .filter((id) => id.startsWith('claude-code-'))
    .map((id) => id.slice('claude-code-'.length))
    .filter((v) => /^\d+(\.\d+)*$/.test(v))
    .sort(versionCmp)
    .pop();

  const dated = new Map<SourceId, RawItem[]>();
  const ccNew: RawItem[] = [];
  for (const it of items) {
    if (known.has(it.id)) continue;
    if (it.source === 'claude-code') {
      if (!it.version) continue;
      if (newestKnownVersion !== undefined && versionCmp(it.version, newestKnownVersion) <= 0) continue;
      ccNew.push(it);
    } else if (it.date && it.date >= cutoff) {
      dated.set(it.source, [...(dated.get(it.source) ?? []), it]);
    }
  }

  // Newest first; on the very first run keep only the newest few.
  ccNew.sort((a, b) => versionCmp(b.version!, a.version!));
  const ccEligible = newestKnownVersion === undefined ? ccNew.slice(0, FIRST_RUN_CLAUDE_CODE) : ccNew;

  // Claude Code goes oldest first: if the cap cuts some, the cut ones are the newest, which stay
  // "newer than the newest known" next run. (Cutting old ones would lose them for good.)
  const lists: RawItem[][] = [[...ccEligible].reverse(), ...dated.values()];

  // Round-robin across sources so one busy source cannot starve the others.
  const out: RawItem[] = [];
  while (out.length < MAX_PER_RUN && lists.some((l) => l.length)) {
    for (const l of lists) {
      const next = l.shift();
      if (next && out.length < MAX_PER_RUN) out.push(next);
    }
  }
  return out;
}
