import path from 'node:path';
import { expect, test } from 'vitest';
import { buildIndex, hashFile } from '../scripts/build-index';

const fx = (name: string) => path.join(import.meta.dirname, 'fixtures', name);

test('lists every content file with kind and 16-char hash, sorted by path', async () => {
  const idx = await buildIndex(fx('valid'), 'abc1234', new Date('2026-11-08T00:00:00Z'));
  expect(idx.formatVersion).toBe(1);
  expect(idx.commit).toBe('abc1234');
  expect(idx.generatedAt).toBe('2026-11-08T00:00:00.000Z');
  expect(idx.files.map((f) => f.path)).toEqual([...idx.files.map((f) => f.path)].sort());
  expect(idx.files.every((f) => f.hash.length === 16)).toBe(true);
  expect(idx.files.find((f) => f.path.startsWith('lessons/'))?.kind).toBe('lesson');
});
test('excludes images and non-json files', async () => {
  expect((await buildIndex(fx('valid'), 'abc1234')).files.some((f) => !f.path.endsWith('.json'))).toBe(false);
});
test('hash changes when file content changes', () =>
  expect(hashFile(Buffer.from('a'))).not.toBe(hashFile(Buffer.from('b'))));
test('hash is line-ending independent', () =>
  expect(hashFile(Buffer.from('a\r\nb'))).toBe(hashFile(Buffer.from('a\nb'))));
