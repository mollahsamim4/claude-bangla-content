import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { detect, MAX_PER_RUN } from '../scripts/release-notes/detect';
import { parseApi } from '../scripts/release-notes/parse-api';
import { parseClaudeCode } from '../scripts/release-notes/parse-claude-code';
import { parseHelpCenter } from '../scripts/release-notes/parse-help-center';
import { fetchSourceText, SOURCES, type RawItem } from '../scripts/release-notes/sources';

const fx = (n: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'release-notes', n), 'utf8');
const NOW = new Date('2026-11-08T12:00:00Z');

function item(over: Partial<RawItem> & Pick<RawItem, 'id' | 'source'>): RawItem {
  return { title: over.id, englishText: 'x', url: 'https://example.com', ...over };
}

describe('parseClaudeCode', () => {
  const items = parseClaudeCode(fx('claude-code-changelog.md'));
  test('one item per version, newest first', () => {
    expect(items.map((i) => i.version)).toEqual(['2.1.319', '2.1.318', '2.1.317', '2.1.316', '0.2.21']);
  });
  test('first item fields', () => {
    expect(items[0]).toMatchObject({
      id: 'claude-code-2.1.319',
      source: 'claude-code',
      title: 'Claude Code 2.1.319',
      version: '2.1.319',
      url: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    });
    expect(items[0].date).toBeUndefined();
    expect(items[0].englishText).toMatch(/^- Changed auto mode/);
    expect(items[0].englishText).not.toMatch(/2\.1\.318|^## /m);
  });
  test('throws on zero entries', () => {
    expect(() => parseClaudeCode('# Changelog\n\nnothing here')).toThrow(/claude-code/i);
  });
});

describe('parseApi', () => {
  const items = parseApi(fx('api-release-notes.md'));
  test('one item per dated heading, newest first, ISO dates', () => {
    expect(items.length).toBeGreaterThan(5);
    expect(items[0]).toMatchObject({
      id: 'api-2026-11-05',
      source: 'claude-api',
      title: 'Claude API — November 5, 2026',
      date: '2026-11-05',
      url: 'https://platform.claude.com/docs/en/release-notes/overview',
    });
    expect(items[0].englishText).toMatch(/^\* You can now set up an IP allowlist/);
    expect(items[0].englishText).not.toMatch(/^###/m);
  });
  test('ids are unique and the intro (frontmatter/tips) is not an item', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.some((i) => i.englishText.includes('For release notes on Claude Apps'))).toBe(false);
  });
  test('same-date headings merge into one item', () => {
    const md = '### March 1, 2026\n\n* a\n\n### March 1, 2026\n\n* b\n';
    const r = parseApi(md);
    expect(r).toHaveLength(1);
    expect(r[0].englishText).toContain('* a');
    expect(r[0].englishText).toContain('* b');
  });
  test('throws on zero entries', () => {
    expect(() => parseApi('# nothing')).toThrow(/api/i);
  });
});

describe('parseHelpCenter', () => {
  const items = parseHelpCenter(fx('help-center-release-notes.md'));
  test('one item per bold-titled entry under a dated heading', () => {
    expect(items[0]).toMatchObject({
      id: 'help-2026-11-06-track-spend-by-cost-code-with-project-tags-beta',
      source: 'help-center',
      title: 'Track spend by cost code with project tags (beta)',
      date: '2026-11-06',
      url: 'https://support.claude.com/en/articles/12138966-release-notes',
    });
    expect(items[0].englishText).toMatch(/^Eligible Enterprise organizations/);
    expect(items[1].date).toBe('2026-11-05');
    expect(items[2].date).toBe('2026-11-05');
  });
  test('ids unique; month headings and separators do not leak into text', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(i.englishText).not.toMatch(/^(##|---)/m);
  });
  test('title directly followed by text (no blank line) still parses', () => {
    const t = items.find((i) => i.title.startsWith('Access to Claude Fable 5'));
    expect(t?.englishText).toMatch(/^We are restoring access/);
  });
  test('throws on zero entries', () => {
    expect(() => parseHelpCenter('# Release notes\n\n## June 2026\n')).toThrow(/help/i);
  });
});

describe('fetchSourceText', () => {
  test('returns body text', async () => {
    const f = async () => new Response('hello', { status: 200 });
    expect(await fetchSourceText(SOURCES.api, f as typeof fetch)).toBe('hello');
  });
  test('throws on non-200', async () => {
    const f = async () => new Response('no', { status: 503 });
    await expect(fetchSourceText(SOURCES.api, f as typeof fetch)).rejects.toThrow(/503/);
  });
});

describe('detect', () => {
  const api = (d: string) => item({ id: `api-${d}`, source: 'claude-api', date: d });
  const cc = (v: string) => item({ id: `claude-code-${v}`, source: 'claude-code', version: v });

  test('window: keeps API/help items dated within 14 days, drops older', () => {
    const out = detect([api('2026-11-05'), api('2026-10-25'), api('2026-10-24'), api('2026-10-10')], new Set(), NOW);
    expect(out.map((i) => i.id)).toEqual(['api-2026-11-05', 'api-2026-10-25']);
  });
  test('dedup: skips ids already in feed or PR branches', () => {
    const out = detect([api('2026-11-05'), api('2026-11-03')], new Set(['api-2026-11-05']), NOW);
    expect(out.map((i) => i.id)).toEqual(['api-2026-11-03']);
  });
  test('claude-code first run: only newest 3 versions', () => {
    const items = ['2.1.319', '2.1.318', '2.1.317', '2.1.316', '2.1.315'].map(cc);
    const out = detect(items, new Set(), NOW);
    expect(out.map((i) => i.version).sort()).toEqual(['2.1.317', '2.1.318', '2.1.319']);
  });
  test('claude-code later run: only versions newer than newest known (numeric compare)', () => {
    const items = ['2.1.319', '2.1.318', '2.1.10', '2.1.9'].map(cc);
    const out = detect(items, new Set(['claude-code-2.1.9']), NOW);
    expect(out.map((i) => i.version).sort()).toEqual(['2.1.10', '2.1.318', '2.1.319'].sort());
  });
  test('claude-code: a known newer PR id hides older unseen versions', () => {
    const out = detect(['2.1.319', '2.1.318', '2.1.317'].map(cc), new Set(['claude-code-2.1.318']), NOW);
    expect(out.map((i) => i.version)).toEqual(['2.1.319']);
  });
  test('cap: at most MAX_PER_RUN, claude-code keeps oldest eligible so none are skipped later', () => {
    expect(MAX_PER_RUN).toBe(8);
    const known = new Set(['claude-code-2.1.100']);
    const items = Array.from({ length: 12 }, (_, i) => cc(`2.1.${112 - i}`)); // 2.1.112 .. 2.1.101
    const out = detect(items, known, NOW);
    expect(out).toHaveLength(8);
    expect(out.map((i) => i.version)).toEqual([
      '2.1.101',
      '2.1.102',
      '2.1.103',
      '2.1.104',
      '2.1.105',
      '2.1.106',
      '2.1.107',
      '2.1.108',
    ]);
  });
  test('cap interleaves sources so one source cannot starve the others', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => cc(`2.1.${200 - i}`)),
      api('2026-11-05'),
      item({ id: 'help-2026-11-06-x', source: 'help-center', date: '2026-11-06' }),
    ];
    const out = detect(items, new Set(['claude-code-2.1.100']), NOW);
    expect(out).toHaveLength(8);
    expect(out.some((i) => i.source === 'claude-api')).toBe(true);
    expect(out.some((i) => i.source === 'help-center')).toBe(true);
  });
  test('pure: does not mutate inputs and accepts arrays for knownIds', () => {
    const items = [api('2026-11-05')];
    const copy = JSON.stringify(items);
    expect(detect(items, ['api-2026-11-05'], NOW)).toEqual([]);
    expect(JSON.stringify(items)).toBe(copy);
  });
});
