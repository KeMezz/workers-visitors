export const MAX_PAGE_LENGTH = 256;

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function cleanExpiredRateLimits(
  map: Map<string, RateLimitEntry>,
  now: number
): void {
  if (map.size > 1000) {
    for (const [key, entry] of map.entries()) {
      if (entry.resetAt <= now) {
        map.delete(key);
      }
    }
  }
}

export function checkRateLimit(
  key: string,
  map: Map<string, RateLimitEntry>,
  maxRequests: number,
  windowMs: number,
  currentTime?: number
): boolean {
  const now = currentTime ?? Date.now();
  cleanExpiredRateLimits(map, now);
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function isValidPageKey(page: string | null | undefined): boolean {
  if (!page || typeof page !== "string") {
    return false;
  }
  const trimmed = page.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PAGE_LENGTH) {
    return false;
  }
  // Disallow control characters, newlines, carriage returns, tabs, and spaces
  if (/[\x00-\x1F\x7F\s]/.test(trimmed)) {
    return false;
  }
  // If formatted as a URL, validate http/https scheme and well-formedness
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  }
  // Disallow other schemes like javascript:, data:, ftp:
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return false;
  }
  // Standard safe key characters
  return /^[a-zA-Z0-9_\-\.\:\/@]+$/.test(trimmed);
}

export function isAllowedPage(
  page: string,
  allowedPagesConfig?: string
): boolean {
  if (!allowedPagesConfig) {
    return true;
  }
  const allowedList = allowedPagesConfig
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (allowedList.length === 0 || allowedList.includes("*")) {
    return true;
  }

  return allowedList.some((allowed) => {
    if (
      allowed.startsWith("*.") &&
      (page.startsWith("http://") || page.startsWith("https://"))
    ) {
      try {
        const url = new URL(page);
        const domain = allowed.slice(2);
        return url.hostname === domain || url.hostname.endsWith("." + domain);
      } catch {
        return false;
      }
    }
    return page === allowed || page.startsWith(allowed);
  });
}
