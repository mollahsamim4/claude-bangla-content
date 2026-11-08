import path from 'node:path';
import { expect, test } from 'vitest';
import { validateRepo } from '../scripts/validate';

const fx = (name: string) => path.join(import.meta.dirname, 'fixtures', name);

test('valid repo has no errors', async () => expect((await validateRepo(fx('valid'))).errors).toEqual([]));
test('invalid JSON is reported with its path', async () =>
  expect((await validateRepo(fx('bad-json'))).errors[0]).toContain('lessons/broken.json'));
test('quiz answer out of range is reported', async () =>
  expect((await validateRepo(fx('bad-answer'))).errors.join()).toContain('answer out of range'));
test('file id must equal file name', async () =>
  expect((await validateRepo(fx('id-mismatch'))).errors.join()).toContain('must equal file name'));
test('duplicate (track, order) is reported', async () =>
  expect((await validateRepo(fx('dup-order'))).errors.join()).toContain('order'));
test('referenced image must exist', async () =>
  expect((await validateRepo(fx('missing-image'))).errors.join()).toContain('images/nope.webp'));
test('lesson with 2 quiz questions is rejected', async () =>
  expect((await validateRepo(fx('short-quiz'))).errors.length).toBeGreaterThan(0));
test('repo with no lessons directory is rejected', async () =>
  expect((await validateRepo(path.join(fx('no-lessons'), 'nowhere'))).errors.join()).toContain('lessons'));
test('repo with zero lesson files is rejected', async () =>
  expect((await validateRepo(fx('no-lessons'))).errors.join()).toContain('lessons'));
