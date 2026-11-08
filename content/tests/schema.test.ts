import { expect, test } from 'vitest';
import { ComingSoonItem, ContentIndex, FeedItem } from '../schema/schema';

const index = (commit: string) => ({ formatVersion: 1, commit, generatedAt: 'x', files: [] });
const feed = (url: string) => ({ id: 'a', source: 'owner', date: '2026-11-08', title: 't', summary: 's', url });
const soon = (url: string) => ({ id: 'a', title: 't', description: 'd', url });

test('index commit must be 7-40 lowercase hex chars', () => {
  expect(ContentIndex.safeParse(index('abc1234')).success).toBe(true);
  expect(ContentIndex.safeParse(index('a'.repeat(40))).success).toBe(true);
  expect(ContentIndex.safeParse(index('not-a-sha-xx')).success).toBe(false);
  expect(ContentIndex.safeParse(index('a'.repeat(41))).success).toBe(false);
});
test('feed and coming-soon urls must be https', () => {
  expect(FeedItem.safeParse(feed('https://example.com/x')).success).toBe(true);
  expect(FeedItem.safeParse(feed('http://example.com/x')).success).toBe(false);
  expect(FeedItem.safeParse(feed('intent://x')).success).toBe(false);
  expect(ComingSoonItem.safeParse(soon('https://example.com')).success).toBe(true);
  expect(ComingSoonItem.safeParse(soon('javascript:alert(1)')).success).toBe(false);
});
