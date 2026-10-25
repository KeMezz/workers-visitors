import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPageKey, isAllowedPage, checkRateLimit, MAX_RATE_LIMIT_ENTRIES } from '../src/validator.ts';
test('keys use UTF-8 byte limits, preserve opaque formats, and reject KV dot keys', () => {
  for (const key of ['My Blog', '홈페이지', 'post~1', 'a%20b', ' leading ', 'a'.repeat(512), '가'.repeat(170)]) assert.ok(isValidPageKey(key));
  for (const key of ['', null, '.', '..', 'a\n', 'a'.repeat(513), '가'.repeat(171)]) assert.ok(!isValidPageKey(key));
});
test('configuration fails closed and grants only finite exact keys', () => {
  for (const config of [undefined, '', '*', '[]', '["*"]', '["*.example.com"]', '[1]', JSON.stringify(Array(101).fill('x')), 'x'.repeat(65537)]) assert.ok(!isAllowedPage('x', config));
  const config = JSON.stringify(['https://myblog.com', '/docs']);
  assert.ok(isAllowedPage('/docs', config));
  for (const key of ['/docs-secret', '/docs/x', 'https://myblog.com.evil.net', 'https://myblog.com/x', 'https://myblog.com?x=1']) assert.ok(!isAllowedPage(key, config));
});
test('local limiter has a hard memory bound, preserves live quotas, expires entries', () => {
  const map = new Map();
  for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES; i++) assert.ok(checkRateLimit(String(i), map, 1, 1000, 1000));
  assert.ok(!checkRateLimit('overflow', map, 1, 1000, 1000));
  assert.equal(map.size, MAX_RATE_LIMIT_ENTRIES);
  assert.ok(!checkRateLimit('0', map, 1, 1000, 1000));
  assert.ok(checkRateLimit('new', map, 1, 1000, 2001));
  assert.equal(map.size, 1);
});
