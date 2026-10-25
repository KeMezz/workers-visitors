import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../src/index.ts';
function fixture(keys) {
  const store = new Map();
  const ops = { reads: 0, writes: 0 };
  return { store, ops, env: { ALLOWED_PAGES: keys === undefined ? undefined : JSON.stringify(keys), view_counter: {
    async get(key) { ops.reads++; return store.get(key) ?? null; },
    async put(key, value) { ops.writes++; store.set(key, value); },
  } } };
}
const visit = (f, page, ip = '192.0.2.1') => worker.fetch(new Request('https://counter.test/visit?' + new URLSearchParams({ page }), { headers: { 'cf-connecting-ip': ip } }), f.env);
test('500 unique keys/IPs cannot create KV keys by default or against a registered site', async () => {
  for (const f of [fixture(), fixture(['https://myblog.com'])]) {
    for (let i = 0; i < 500; i++) assert.equal((await visit(f, `https://myblog.com/${i}`, `2001:db8::${i.toString(16)}`)).status, 403);
    assert.equal(f.store.size, 0); assert.deepEqual(f.ops, { reads: 0, writes: 0 });
  }
});
test('host spoof, wildcard, path, query, and prefix keys cannot reach KV', async () => {
  const f = fixture(['https://myblog.com', '/docs']);
  for (const page of ['https://myblog.com.evil.net/x', 'https://myblog.comevil', 'https://myblog.com/random1', '/docs-secret', '/docs/x', 'https://a.example.com/x', 'https://myblog.com?x=1']) assert.equal((await visit(f, page)).status, 403);
  f.env.ALLOWED_PAGES = '["*.example.com"]';
  assert.equal((await visit(f, 'https://a.example.com/x')).status, 403);
  assert.deepEqual(f.ops, { reads: 0, writes: 0 });
});
test('100 distinct legitimate visitors in a burst all increment the same registered key', async () => {
  const f = fixture(['site']);
  for (let i = 0; i < 100; i++) {
    const res = await visit(f, 'site', `198.51.100.${i}`);
    assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  }
  assert.equal(f.store.get('site'), '100'); assert.equal(f.ops.writes, 100);
});
test('IP rejections perform no KV access and do not block another visitor', async () => {
  const f = fixture(['victim']);
  for (let i = 0; i < 60; i++) assert.equal((await visit(f, 'victim', '203.0.113.7')).status, 200);
  for (let i = 0; i < 100; i++) assert.equal((await visit(f, 'victim', '203.0.113.7')).status, 429);
  assert.deepEqual(f.ops, { reads: 60, writes: 60 });
  assert.equal((await visit(f, 'victim', '203.0.113.8')).status, 200);
  assert.equal(f.store.get('victim'), '61');
});
test('registered opaque keys preserve existing counters without trimming or decoding twice', async () => {
  const keys = ['My Blog', '홈페이지', 'post~1', 'a%20b', ' leading ', 'x'.repeat(512), '가'.repeat(170)];
  const f = fixture(keys);
  for (const key of keys) {
    f.store.set(key, '41'); assert.equal((await visit(f, key, '203.0.113.9')).status, 200);
    assert.equal(f.store.get(key), '42');
  }
  for (const key of ['.', '..', '가'.repeat(171), 'x'.repeat(513)]) assert.equal((await visit(f, key)).status, 400);
  assert.equal(f.store.size, keys.length);
});
test('existing home demo is explicitly registered and read counts remain numeric', async () => {
  const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const allowed = JSON.parse(config.match(/ALLOWED_PAGES = '(.*)'/)[1]);
  const f = fixture(allowed);
  for (const old of ['9', 'not-a-number', '-10']) {
    f.store.set(allowed[0], old);
    const res = await visit(f, allowed[0], '203.0.113.10'); assert.equal(res.status, 200);
    assert.equal(f.store.get(allowed[0]), old === '9' ? '10' : '1');
  }
  assert.equal((await worker.fetch(new Request('https://counter.test/'), f.env)).status, 200);
  assert.equal((await worker.fetch(new Request('https://counter.test/missing'), f.env)).status, 404);
});
test('storage errors return 500 without pretending a count succeeded', async () => {
  const f = fixture(['error']); f.env.view_counter.get = async () => { throw Error('mock failure'); };
  assert.equal((await visit(f, 'error', '203.0.113.11')).status, 500); assert.equal(f.ops.writes, 0);
});
test('missing key and malformed configuration fail before KV', async () => {
  const f = fixture(['site']);
  assert.equal((await worker.fetch(new Request('https://counter.test/visit'), f.env)).status, 400);
  for (const config of ['', '[]', '*', '["*"]', '{', '[1]']) {
    f.env.ALLOWED_PAGES = config;
    assert.equal((await visit(f, 'site')).status, 403);
  }
  assert.deepEqual(f.ops, { reads: 0, writes: 0 });
});
