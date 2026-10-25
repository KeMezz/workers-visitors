# Visitor counter

Use Node 22.x, `npm ci`, `npm test`, and `npm run build` (Wrangler dry-run only).
`npm run deploy` is an explicit operator deployment command, never part of build.

## Register existing counters before release

`ALLOWED_PAGES` is a JSON array of **exact KV keys**, at most 100 keys, with each
key at most 512 UTF-8 bytes. Missing, malformed, empty, oversized, or wildcard
configuration rejects all visits before KV access. The checked-in wrangler.toml
explicitly registers the existing home.html demo key:
`https://workers-visitors.z97zy4wcnb5409.workers.dev/`.

Inventory your own existing counter keys before release and add them explicitly:

```toml
[vars]
ALLOWED_PAGES = '["https://workers-visitors.z97zy4wcnb5409.workers.dev/", "https://myblog.com/", "My Blog", "홈페이지", "post~1", "a%20b", " leading "]'
```

This replaces the prior comma-separated prefix/wildcard configuration. Keys are
opaque: scheme/case/path/query/trailing slash and spaces must match exactly.
No URL normalization, trimming, or migration of existing KV values is performed.
Use URLSearchParams or encodeURIComponent when putting a key in `?page=`. It is
decoded once by URLSearchParams; `a%20b` as an existing literal key must be sent
as `a%2520b`. Empty keys, `.`/`..`, and control characters are rejected. A key is
never inserted into SVG markup (only its numeric count is rendered).

An unauthenticated visitor can increment a registered counter; registration bounds
the number of writable keys, not total writes or visitor authenticity. The local
60 requests/minute/IP burst guard is per isolate, has at most 10,000 entries with
expiry, and denies new IPs when full until entries expire. It is not a distributed
quota. A busy isolate or shared IP may see 429; there is no page-wide limit that
blocks independent visitors. IP rejections do not read or write KV. For distributed
cost/abuse controls use owner-configured Cloudflare Rate Limiting rules or a
Durable Object; those controls have not been deployed by this patch.

KV read/increment/put remains eventually consistent and non-atomic: concurrent
visits can lose increments, and Cloudflare KV per-key write limits can still
return storage errors. Tests use mock KV and do not establish production capacity.
