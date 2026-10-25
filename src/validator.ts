export const MAX_PAGE_BYTES = 512;
export const MAX_REGISTERED_PAGES = 100;
export const MAX_ALLOWLIST_BYTES = 65536;
export const MAX_RATE_LIMIT_ENTRIES = 10000;
const encoder = new TextEncoder();

export interface RateLimitEntry { count: number; resetAt: number; }
const lastCleanup = new WeakMap<Map<string, RateLimitEntry>, number>();

export function checkRateLimit(
  key: string, map: Map<string, RateLimitEntry>, maxRequests: number,
  windowMs: number, currentTime = Date.now()
): boolean {
  if (key.length > 128) return false;
  const entry = map.get(key);
  if (entry && entry.resetAt > currentTime) {
    if (entry.count >= maxRequests) return false;
    entry.count += 1;
    return true;
  }
  // Do not evict live entries: that would reset an attacker's quota. Sweep at
  // most once a second under saturation, bounding both storage and sweep work.
  if (!entry && map.size >= MAX_RATE_LIMIT_ENTRIES) {
    if (currentTime - (lastCleanup.get(map) ?? -Infinity) >= 1000) {
      lastCleanup.set(map, currentTime);
      for (const [k, value] of map) if (value.resetAt <= currentTime) map.delete(k);
    }
    if (map.size >= MAX_RATE_LIMIT_ENTRIES) return false;
  }
  map.set(key, { count: 1, resetAt: currentTime + windowMs });
  return true;
}

export function isValidPageKey(page: string | null | undefined): page is string {
  // Keys are opaque; do not trim, normalize URLs, or decode a second time.
  return typeof page === "string" && page.length > 0 && page.length <= MAX_PAGE_BYTES &&
    page !== "." && page !== ".." && !/[\x00-\x1f\x7f]/.test(page) &&
    encoder.encode(page).byteLength <= MAX_PAGE_BYTES;
}

export function isAllowedPage(page: string, config?: string): boolean {
  if (!isValidPageKey(page) || typeof config !== "string" ||
      config.length > MAX_ALLOWLIST_BYTES || encoder.encode(config).byteLength > MAX_ALLOWLIST_BYTES) return false;
  try {
    const keys: unknown = JSON.parse(config);
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_REGISTERED_PAGES ||
        !keys.every((key) => isValidPageKey(key) && !key.includes("*"))) return false;
    return keys.includes(page);
  } catch { return false; }
}
