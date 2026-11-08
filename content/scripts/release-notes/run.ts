import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepo } from '../validate';
import { detect } from './detect';
import { fromFeedId, openPr } from './open-prs';
import { spawnRunner } from './runner';
import { fetchSourceText, REGISTRY, type RawItem, type SourceId } from './sources';
import { summarize, type SummarizeResult } from './summarize';

export interface PipelineDeps {
  now: Date;
  fetchText: (source: (typeof REGISTRY)[SourceId]['source']) => Promise<string>;
  /** Parsers by source (defaults come from REGISTRY in main). */
  parsers: Record<SourceId, (markdown: string) => RawItem[]>;
  knownIds: () => Promise<string[]>;
  summarize: (item: RawItem) => Promise<SummarizeResult>;
  openPr: (item: RawItem, summary: string) => Promise<unknown>;
  log: (msg: string) => void;
}

export interface PipelineResult {
  opened: string[];
  failures: string[];
}

const SOURCE_IDS = Object.keys(REGISTRY) as SourceId[];

/**
 * Fetch + parse every source (one broken source does not stop the others), detect new items, then
 * summarize and open a PR for each. Claude Code items are processed oldest -> newest and the first
 * failure stops the remaining claude-code items: detect treats everything <= the newest known version
 * as done, so skipping an older version and proposing a newer one would lose the older one for good.
 */
export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const failures: string[] = [];
  const opened: string[] = [];
  const all: RawItem[] = [];

  for (const id of SOURCE_IDS) {
    try {
      const text = await deps.fetchText(REGISTRY[id].source);
      const items = deps.parsers[id](text);
      deps.log(`${id}: parsed ${items.length} entries`);
      all.push(...items);
    } catch (e) {
      failures.push(`${id}: ${(e as Error).message}`);
      deps.log(`ERROR ${id}: ${(e as Error).message}`);
    }
  }

  const todo = detect(all, await deps.knownIds(), deps.now);
  deps.log(`${todo.length} new item(s) to propose`);

  // detect lists claude-code oldest first; make that explicit so the stop rule stays correct.
  const ccStopped = { value: false };
  for (const item of todo) {
    if (item.source === 'claude-code' && ccStopped.value) {
      deps.log(`skip ${item.id}: an older claude-code item failed in this run`);
      continue;
    }
    const fail = (msg: string) => {
      failures.push(`${item.id}: ${msg}`);
      deps.log(`ERROR ${item.id}: ${msg}`);
      if (item.source === 'claude-code') ccStopped.value = true;
    };
    const s = await deps.summarize(item);
    if (!s.ok) {
      fail(`summarize failed: ${s.reason}`);
      continue;
    }
    try {
      await deps.openPr(item, s.summary);
      opened.push(item.id);
      deps.log(`opened PR for ${item.id}`);
    } catch (e) {
      fail(`open PR failed: ${(e as Error).message}`);
    }
  }
  return { opened, failures };
}

async function main() {
  const contentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const repoRoot = path.resolve(contentDir, '..');
  const now = new Date();

  const knownIds = async () => {
    const names = (await fs.readdir(path.join(contentDir, 'feed'))).filter((n) => n.endsWith('.json'));
    const ids = names.map((n) => fromFeedId(n.replace(/\.json$/, '')));
    // A failure here must abort the run: without the PR list we could propose duplicates.
    const res = await spawnRunner('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'headRefName'], { cwd: repoRoot });
    if (res.code !== 0) throw new Error(`gh pr list failed: ${res.stderr.trim()}`);
    const prefix = 'release-notes/';
    for (const pr of JSON.parse(res.stdout) as { headRefName: string }[]) {
      if (pr.headRefName.startsWith(prefix)) ids.push(fromFeedId(pr.headRefName.slice(prefix.length)));
    }
    return ids;
  };

  const result = await runPipeline({
    now,
    fetchText: (source) => fetchSourceText(source),
    parsers: Object.fromEntries(SOURCE_IDS.map((id) => [id, REGISTRY[id].parse])) as PipelineDeps['parsers'],
    knownIds,
    summarize: (item) => summarize(item),
    openPr: (item, summary) =>
      openPr(item, summary, {
        git: spawnRunner,
        gh: spawnRunner,
        validate: async (dir) => (await validateRepo(dir)).errors,
        repoRoot,
        now,
      }),
    log: (m) => console.log(m),
  });

  console.log(`done: ${result.opened.length} PR(s) opened, ${result.failures.length} failure(s)`);
  if (result.failures.length) {
    console.error(`Failures:\n${result.failures.map((f) => `- ${f}`).join('\n')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
