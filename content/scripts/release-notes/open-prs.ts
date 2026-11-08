import fs from 'node:fs/promises';
import path from 'node:path';
import { FeedItem } from '../../schema/schema';
import { envWithout, type Runner } from './runner';
import { formatLongDate, REGISTRY, type RawItem } from './sources';
import { truncateEnglish } from './summarize';

export type { Runner } from './runner';

/** Feed ids may only contain [a-z0-9-], so Claude Code versions lose their dots in file/branch names. */
export function toFeedId(id: string): string {
  return id.startsWith('claude-code-') ? id.replace(/\./g, '-') : id;
}
/** Inverse of toFeedId: only a real `claude-code-X-Y-Z` shape is converted back to dotted form. */
export function fromFeedId(feedId: string): string {
  const m = /^claude-code-(\d+)-(\d+)-(\d+)$/.exec(feedId);
  return m ? `claude-code-${m[1]}.${m[2]}.${m[3]}` : feedId;
}

/**
 * Known id for an existing feed file. Only files whose JSON `source` is "claude-code" are Claude Code
 * versions: an owner post named e.g. claude-code-2026-11-08 must not look like version 2026.11.8.
 */
export function knownIdFromFeedFile(fileBase: string, source: unknown): string {
  return source === 'claude-code' ? fromFeedId(fileBase) : fileBase;
}

const ZWJ = '‍';
/** Neutralise things GitHub would act on in untrusted text: @-mentions, #N / org/repo#N refs, HTML comments. */
export function sanitizeForGithub(text: string): string {
  let t = text;
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(/<!--[\s\S]*?-->/g, '');
  }
  t = t.replace(/<!--/g, '');
  return t.replace(/@/g, `@${ZWJ}`).replace(/#(?=\d)/g, `#${ZWJ}`);
}

/** Fence longer than any backtick run inside the text. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  return '`'.repeat(Math.max(3, longest + 1));
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
  const t = item.source === 'help-center' && item.date ? `Claude Help Center — ${formatLongDate(item.date)}: ${item.title}` : item.title;
  return sanitizeForGithub(t);
}

export function prBody(item: RawItem, summary: string): string {
  const english = sanitizeForGithub(truncateEnglish(item.englishText, 6000));
  const fence = fenceFor(english);
  return `Proposed Bengali summary for a new official Claude release note.

**Source:** ${item.url}

## Bengali summary

${sanitizeForGithub(summary)}

## English original

${fence}text
${english}
${fence}

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
  // git/gh must never see the Claude credentials.
  const env = envWithout(process.env, [/^CLAUDE_CODE_OAUTH_TOKEN$/, /^ANTHROPIC_/]);
  const exec = async (r: Runner, cmd: string, args: string[]) => {
    const res = await r(cmd, args, { cwd: deps.repoRoot, env });
    if (res.code !== 0) throw new Error(`${cmd} ${args[0]} failed (${res.code}): ${res.stderr.trim().slice(0, 300)}`);
    return res.stdout;
  };
  const feed = buildFeedItem(item, summary, deps.now);
  let committed = false;
  try {
    await exec(deps.git, 'git', ['checkout', '-B', branch, base]);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
    const errors = await deps.validate(path.join(deps.repoRoot, 'content'));
    if (errors.length) throw new Error(`validation failed for ${rel}: ${errors.join('; ')}`);
    await exec(deps.git, 'git', ['add', rel]);
    await exec(deps.git, 'git', ['commit', '-m', `Add release note: ${item.title}`]);
    committed = true;
    // Force: release-notes/<id> is bot-owned and, by detect's dedup, has no PR yet. A leftover branch from
    // an earlier run whose `gh pr create` failed must not make every later push non-fast-forward.
    await exec(deps.git, 'git', ['push', '--force', 'origin', branch]);
    try {
      const out = await exec(deps.gh, 'gh', ['pr', 'create', '--base', base, '--head', branch, '--title', prTitle(item), '--body', prBody(item, summary)]);
      return out.trim();
    } catch (e) {
      // No PR exists, so drop the pushed branch rather than leave an orphan.
      await deps.git('git', ['push', 'origin', '--delete', branch], { cwd: deps.repoRoot, env }).catch(() => {});
      throw e;
    }
  } finally {
    // An uncommitted feed file must not leak into the next item's branch.
    if (!committed) await fs.rm(file, { force: true });
    await deps.git('git', ['checkout', base], { cwd: deps.repoRoot, env }).catch(() => {});
  }
}
