import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  fromFeedId,
  knownIdFromFeedFile,
  openPr,
  prBody,
  prTitle,
  sanitizeForGithub,
  type Runner,
} from '../scripts/release-notes/open-prs';
import { parseHelpCenter } from '../scripts/release-notes/parse-help-center';
import { envWithout } from '../scripts/release-notes/runner';
import { MAX_SUMMARY_CHARS, summarize } from '../scripts/release-notes/summarize';
import type { RawItem } from '../scripts/release-notes/sources';

const BN = 'এটি একটি বাংলা সারাংশ। এই আপডেটে নতুন সুবিধা যোগ হয়েছে এবং কয়েকটি সমস্যা ঠিক করা হয়েছে।';
const claudeOut = (summary: string) => JSON.stringify({ is_error: false, result: JSON.stringify({ summary }) });
const raw = (over: Partial<RawItem> = {}): RawItem => ({
  id: 'api-2026-11-05',
  source: 'claude-api',
  title: 'Claude API — November 5, 2026',
  date: '2026-11-05',
  englishText: 'You can now do X.',
  url: 'https://platform.claude.com/docs/en/release-notes/overview',
  ...over,
});

describe('1. claude call isolation', () => {
  test('strict-mcp-config, tools off, fresh empty cwd outside the repo, no GitHub tokens', async () => {
    let seen: { args: string[]; cwd?: string; env?: NodeJS.ProcessEnv; existed?: boolean; entries?: string[] } | undefined;
    const run: Runner = async (_c, args, o) => {
      seen = { args, cwd: o?.cwd, env: o?.env, existed: !!o?.cwd && fs.existsSync(o.cwd), entries: o?.cwd ? fs.readdirSync(o.cwd) : [] };
      return { code: 0, stdout: claudeOut(BN), stderr: '' };
    };
    process.env.GH_TOKEN = 'ghs_secret';
    process.env.GITHUB_TOKEN = 'ghs_secret2';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth';
    await summarize(raw(), run);
    expect(seen!.args).toContain('--strict-mcp-config');
    expect(seen!.args).toEqual(expect.arrayContaining(['--tools', '']));
    expect(seen!.cwd).toBeTruthy();
    expect(path.resolve(seen!.cwd!).startsWith(path.resolve(os.tmpdir()))).toBe(true);
    expect(seen!.existed).toBe(true);
    expect(seen!.entries).toEqual([]);
    expect(fs.existsSync(seen!.cwd!)).toBe(false); // cleaned up afterwards
    expect(seen!.env!.GH_TOKEN).toBeUndefined();
    expect(seen!.env!.GITHUB_TOKEN).toBeUndefined();
    expect(seen!.env!.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth');
  });
});

describe('2. env stripping', () => {
  test('envWithout drops matching names', () => {
    const e = envWithout({ A: '1', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', GH_TOKEN: 'g' }, [/^ANTHROPIC_/, /^CLAUDE_CODE_OAUTH_TOKEN$/]);
    expect(e).toEqual({ A: '1', GH_TOKEN: 'g' });
  });
  test('git/gh get an env without Claude/Anthropic credentials', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth';
    process.env.ANTHROPIC_API_KEY = 'k';
    const envs: (NodeJS.ProcessEnv | undefined)[] = [];
    const run: Runner = async (_c, _a, o) => {
      envs.push(o?.env);
      return { code: 0, stdout: 'u', stderr: '' };
    };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-'));
    await openPr(raw(), BN, { git: run, gh: run, validate: async () => [], repoRoot: root, now: new Date('2026-11-08T00:00:00Z') });
    expect(envs.length).toBeGreaterThan(3);
    for (const e of envs) {
      expect(e).toBeDefined();
      expect(e!.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(e!.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });
});

describe('3/8. openPr failure handling', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const setup = (failOn: (line: string) => boolean) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-'));
    const log: string[] = [];
    const run: Runner = async (c, a) => {
      const line = [c, ...a].join(' ');
      log.push(line);
      return { code: failOn(line) ? 1 : 0, stdout: 'u', stderr: 'fail' };
    };
    return { root, log, run };
  };
  const file = (root: string) => path.join(root, 'content', 'feed', 'api-2026-11-05.json');

  test('push is forced and gh failure deletes the remote branch', async () => {
    const { root, log, run } = setup((l) => l.startsWith('gh pr create'));
    await expect(openPr(raw(), BN, { git: run, gh: run, validate: async () => [], repoRoot: root, now })).rejects.toThrow(/gh pr/);
    expect(log.find((l) => l.startsWith('git push') && !l.includes('--delete'))).toContain('--force');
    expect(log).toContain('git push origin --delete release-notes/api-2026-11-05');
    expect(log[log.length - 1]).toMatch(/^git checkout main/);
  });
  test('uncommitted feed file is removed when commit fails', async () => {
    const { root, run } = setup((l) => l.startsWith('git commit'));
    await expect(openPr(raw(), BN, { git: run, gh: run, validate: async () => [], repoRoot: root, now })).rejects.toThrow();
    expect(fs.existsSync(file(root))).toBe(false);
  });
  test('uncommitted feed file is removed when git add fails', async () => {
    const { root, run } = setup((l) => l.startsWith('git add'));
    await expect(openPr(raw(), BN, { git: run, gh: run, validate: async () => [], repoRoot: root, now })).rejects.toThrow();
    expect(fs.existsSync(file(root))).toBe(false);
  });
});

describe('5. strict ids', () => {
  test('fromFeedId only converts real version shapes', () => {
    expect(fromFeedId('claude-code-2-1-319')).toBe('claude-code-2.1.319');
    expect(fromFeedId('claude-code-foo')).toBe('claude-code-foo');
    expect(fromFeedId('claude-code-2-1')).toBe('claude-code-2-1');
    expect(fromFeedId('claude-code-2-1-319-extra')).toBe('claude-code-2-1-319-extra');
  });
  test('only feed files whose source is claude-code count as versions', () => {
    expect(knownIdFromFeedFile('claude-code-2-1-319', 'claude-code')).toBe('claude-code-2.1.319');
    expect(knownIdFromFeedFile('claude-code-2026-11-08', 'owner')).toBe('claude-code-2026-11-08');
    expect(knownIdFromFeedFile('claude-code-2026-11-08', undefined)).toBe('claude-code-2026-11-08');
    expect(knownIdFromFeedFile('api-2026-11-05', 'claude-api')).toBe('api-2026-11-05');
  });
});

describe('6. PR body hardening', () => {
  test('English original in a fence longer than any backtick run', () => {
    const body = prBody(raw({ englishText: 'code:\n````\nx\n````\n```js\ny\n```' }), BN);
    const fences = body.match(/^`{5,}(text)?$/gm);
    expect(fences).toHaveLength(2);
  });
  test('neutralises mentions, issue refs and HTML comments', () => {
    const out = sanitizeForGithub('hi @octocat see foo/bar#12 and #34 <!-- hidden --> ok <!-- multi\nline --> end');
    expect(out).not.toMatch(/@octocat/);
    expect(out).not.toMatch(/bar#12/);
    expect(out).not.toMatch(/ #34/);
    expect(out).not.toMatch(/hidden|multi/);
    expect(out.replace(/‍/g, '')).toContain('@octocat');
  });
  test('body and title are sanitised', () => {
    const body = prBody(raw({ englishText: 'ping @someone' }), 'সারাংশ @someone');
    expect(body).not.toMatch(/@someone/);
    expect(prTitle(raw({ title: 'x @someone' }))).not.toMatch(/@someone/);
  });
});

describe('7. Bengali check', () => {
  const ok = async (s: string) => (await summarize(raw(), async () => ({ code: 0, stdout: claudeOut(s), stderr: '' }))).ok;
  test('needs mostly-Bengali prose (by script, vowel signs included)', async () => {
    expect(await ok('ক ' + 'English words only here for the rest of this sentence')).toBe(false);
    expect(await ok('Claude Console-এ নতুন সুবিধা যোগ হয়েছে, যা আপনি এখন ব্যবহার করতে পারবেন।')).toBe(true);
    expect(await ok('This release adds MCP tasks, a new permissions setting and many bug fixes for Claude Code users. এটি ভালো।')).toBe(false);
  });
  test('accepts a real tech-heavy Bengali summary (failed the old letter-only 40% check on CI)', async () => {
    const real =
      'Messages API-তে এখন beta হিসেবে message threads এসেছে, যা `message-threads-2026-08-12` beta header দিয়ে ব্যবহার করা যায়। এতে API পুরো কথোপকথন server-এ রেখে দেয়, তাই পরের প্রতিটি request-এ শুধু নতুন messages পাঠালেই হয়। এর ফলে লম্বা কথোপকথন ও agent loop-এ request ছোট হয় এবং time to first token কম লাগে। শেষ request-এর ৫ মিনিট পরে thread-এর মেয়াদ শেষ হয়ে যায় এবং শেষবার ব্যবহারের পর বড়জোর ১ ঘণ্টার মধ্যে সেটি মুছে ফেলা হয়। এটি Claude API, Claude Platform on AWS, Claude Models on Google Cloud (Anthropic managed) এবং Claude in Microsoft Foundry-তে পাওয়া যাচ্ছে।';
    expect(await ok(real)).toBe(true);
    // Command-heavy but genuinely Bengali: old letter-only ratio 0.19, script ratio (code spans ignored) 0.40.
    const heavy =
      'Claude Code-এ নতুন `permissions.denyInsteadOfPrompting` setting, `/claude-api latency-optimize` command, MCP tasks আর LLM gateway-এর auto mode এসেছে, যা `CLAUDE_CODE_AUTO_MODE_SERVER` দিয়ে নিয়ন্ত্রণ করা যায়; Bash permission bypass ও worktree sandbox escape-সহ কয়েকটি security সমস্যাও ঠিক করা হয়েছে।';
    expect(await ok(heavy)).toBe(true);
  });
  test('rejects overlong summaries', async () => {
    expect(await ok('ক'.repeat(MAX_SUMMARY_CHARS + 1))).toBe(false);
    expect(await ok('ক'.repeat(MAX_SUMMARY_CHARS))).toBe(true);
  });
});

describe('10. help center extra warnings', () => {
  afterEach(() => vi.restoreAllMocks());
  test('warns about text before the first title in a section that has entries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseHelpCenter('### November 5, 2026\n\nStray intro line.\n\n**Title**\n\nBody\n');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/2026-11-05/);
  });
  test('warns about a title with no body', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseHelpCenter('### November 5, 2026\n\n**Empty one**\n\n**Real**\n\nBody\n');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Empty one/);
  });
});
