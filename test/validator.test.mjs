import test from "node:test";
import assert from "node:assert/strict";

// We test validator logic directly
import {
  isValidPageKey,
  isAllowedPage,
  checkRateLimit,
  MAX_PAGE_LENGTH,
} from "../src/validator.ts";
import { makeBadge } from "../src/utils.ts";

test("isValidPageKey accepts valid URL and slug formats", () => {
  assert.equal(isValidPageKey("https://example.com/blog/1"), true);
  assert.equal(isValidPageKey("http://localhost:3000/page"), true);
  assert.equal(isValidPageKey("home-page"), true);
  assert.equal(isValidPageKey("user_profile/v2"), true);
  assert.equal(isValidPageKey("site.com/about"), true);
});

test("isValidPageKey rejects null, empty, or whitespace strings", () => {
  assert.equal(isValidPageKey(null), false);
  assert.equal(isValidPageKey(undefined), false);
  assert.equal(isValidPageKey(""), false);
  assert.equal(isValidPageKey("   "), false);
  assert.equal(isValidPageKey("page with spaces"), false);
});

test("isValidPageKey rejects strings exceeding MAX_PAGE_LENGTH", () => {
  const normal = "a".repeat(MAX_PAGE_LENGTH);
  assert.equal(isValidPageKey(normal), true);

  const oversized = "a".repeat(MAX_PAGE_LENGTH + 1);
  assert.equal(isValidPageKey(oversized), false);
});

test("isValidPageKey rejects control characters and unsafe schemes", () => {
  assert.equal(isValidPageKey("page\nkey"), false);
  assert.equal(isValidPageKey("page\rkey"), false);
  assert.equal(isValidPageKey("page\x00key"), false);
  assert.equal(isValidPageKey("javascript:alert(1)"), false);
  assert.equal(isValidPageKey("data:text/html,bad"), false);
});

test("isAllowedPage correctly enforces allowed page configurations", () => {
  // When unconfigured, all valid pages pass
  assert.equal(isAllowedPage("https://example.com", undefined), true);
  assert.equal(isAllowedPage("https://example.com", ""), true);
  assert.equal(isAllowedPage("https://example.com", "*"), true);

  // Exact match and prefix match
  const config = "https://myblog.com, /docs, *.example.com";
  assert.equal(isAllowedPage("https://myblog.com", config), true);
  assert.equal(isAllowedPage("/docs/getting-started", config), true);
  assert.equal(isAllowedPage("https://sub.example.com/page", config), true);
  assert.equal(isAllowedPage("https://example.com/page", config), true);
  assert.equal(isAllowedPage("https://malicious.com", config), false);
  assert.equal(isAllowedPage("/admin", config), false);
});

test("checkRateLimit limits burst requests and resets after window", () => {
  const limits = new Map();
  const key = "192.168.1.1";
  const windowMs = 1000;
  const maxRequests = 3;
  let simulatedTime = 10000;

  // 1st, 2nd, 3rd requests succeed
  assert.equal(checkRateLimit(key, limits, maxRequests, windowMs, simulatedTime), true);
  assert.equal(checkRateLimit(key, limits, maxRequests, windowMs, simulatedTime), true);
  assert.equal(checkRateLimit(key, limits, maxRequests, windowMs, simulatedTime), true);

  // 4th request exceeds maxRequests
  assert.equal(checkRateLimit(key, limits, maxRequests, windowMs, simulatedTime), false);

  // After window expires, new requests succeed
  simulatedTime += windowMs + 10;
  assert.equal(checkRateLimit(key, limits, maxRequests, windowMs, simulatedTime), true);
});

test("makeBadge returns valid SVG badge markup", () => {
  const badge = makeBadge(1234);
  assert.ok(badge.includes("<svg"));
  assert.ok(badge.includes("Views:  1,234"));
  assert.ok(badge.includes("</svg>"));
});
