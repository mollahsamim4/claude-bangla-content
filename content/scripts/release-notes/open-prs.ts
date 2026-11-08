import fs from 'node:fs/promises';
import path from 'node:path';
import { FeedItem } from '../../schema/schema';
import type { Runner } from './runner';
import { formatLongDate, REGISTRY, type RawItem } from './sources';
import { truncateEnglish } from './summarize';

export type { Runner } from './runner';

/** Feed ids may only contain [a-z0-9-], so Claude Code versions lose their dots in file/branch names. */
export function toFeedId(id: string): string {
  return id.startsWith('claude-code-') ? id.replace(/\./g, '-') : id;
}
/** Inverse of toFeedId: feed file name / PR branch suffix -> detect's id. */
export function fromFeedId(feedId: string): string {
  if (!feedId.startsWith('claude-code-')) return feedId;
  return `claude-code-${feedId.slice('claude-code-'.length).replace(/-/g, '.')}`;
}

export function buildFeedItem(item: RawItem, summary: string, now: Date): FeedItem {
  return FeedItem.parse({
    id: toFeedId(item.id),
    source: REGISTRY[item.source].feedSource,
    date: item.date ?? now.toISOString().slice(0, 10),
    title: item.title,
    summary,
    originalEn: truncateEnglish(item.englishText),
    url: item.url,
  });
}

export function prTitle(item: RawItem): string {
  if (item.source === 'help-center' && item.date) return `Claude Help Center — ${formatLongDate(item.date)}: ${item.title}`;
  return item.title;
}

export function prBody(item: RawItem, summary: string): string {
  const quoted = truncateEnglish(item.englishText, 6000)
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  return `Proposed Bengali summary for a new official Claude release note.

**Source:** ${item.url}

## Bengali summary

${summary}

## English original

${quoted}

---
Edit the Bengali summary in this PR (\`content/feed/${toFeedId(item.id)}.json\`) if needed, then **merge** to publish it in the app, or **close** this PR to reject it.
`;
}

export interface OpenPrDeps {
  git: Runner;
  gh: Runner;
  /** Returns validation errors for the content tree rooted at the given dir. */
  validate: (contentDir: string) => Promise<string[]>;
  repoRoot: string;
  now: Date;
  baseBranch?: string;
}

/** Branch from main, write the feed file, validate, commit, push, open a PR. Always returns to main. Returns the PR url. */
export async function openPr(item: RawItem, summary: string, deps: OpenPrDeps): Promise<string> {
  const base = deps.baseBranch ?? 'main';
  const feedId = toFeedId(item.id);
  const branch = `release-notes/${feedId}`;
  const rel = `content/feed/${feedId}.json`;
  const file = path.join(deps.repoRoot, rel);
  const exec = async (r: Runner, cmd: string, args: string[]) => {
    const res = await r(cmd, args, { cwd: deps.repoRoot });
    if (res.code !== 0) throw new Error(`${cmd} ${args[0]} failed (${res.code}): ${res.stderr.trim().slice(0, 300)}`);
    return res.stdout;
  };
  const feed = buildFeedItem(item, summary, deps.now);
  try {
    await exec(deps.git, 'git', ['checkout', '-B', branch, base]);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
    const errors = await deps.validate(path.join(deps.repoRoot, 'content'));
    if (errors.length) {
      await fs.rm(file, { force: true });
      throw new Error(`validation failed for ${rel}: ${errors.join('; ')}`);
    }
    await exec(deps.git, 'git', ['add', rel]);
    await exec(deps.git, 'git', ['commit', '-m', `Add release note: ${item.title}`]);
    await exec(deps.git, 'git', ['push', 'origin', branch]);
    const out = await exec(deps.gh, 'gh', ['pr', 'create', '--base', base, '--head', branch, '--title', prTitle(item), '--body', prBody(item, summary)]);
    return out.trim();
  } finally {
    await deps.git('git', ['checkout', base], { cwd: deps.repoRoot }).catch(() => {});
  }
}
