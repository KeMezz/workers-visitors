import { makeBadge } from "./utils.ts";
import { checkRateLimit, isValidPageKey, isAllowedPage } from "./validator.ts";
import type { RateLimitEntry } from "./validator.ts";

export interface Env {
  view_counter: KVNamespace;
  // JSON array of exact, finite KV keys. Missing/invalid configuration denies all.
  ALLOWED_PAGES?: string;
}

// Bounded, expiring state local to this isolate. This is not distributed protection.
const ipLimits = new Map<string, RateLimitEntry>();

export async function handleVisit(
  searchParams: URLSearchParams,
  env: Env,
  clientIp: string = "unknown"
): Promise<Response> {
  const page = searchParams.get("page");
  if (!isValidPageKey(page)) {
    return handleBadRequest("Invalid page parameter. Must be a non-empty KV key of at most 512 UTF-8 bytes.");
  }

  const validPage = page!;

  if (!isAllowedPage(validPage, env.ALLOWED_PAGES)) {
    return new Response("Forbidden: Page is not authorized.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Local burst guard only. No page-wide quota: independent visitors do not
  // consume each other's allowance, and rejected requests perform no KV access.
  if (!checkRateLimit(clientIp, ipLimits, 60, 60_000)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let value = 1;
  try {
    const kvPage = await env.view_counter.get(validPage);
    if (kvPage) {
      const parsed = parseInt(kvPage, 10);
      value = Number.isFinite(parsed) && parsed >= 0 ? parsed + 1 : 1;
    }
    await env.view_counter.put(validPage, value.toString());
  } catch (err) {
    console.error("KV operation error:", err);
    return new Response("Internal Storage Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(makeBadge(value), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

function handleBadRequest(message: string = "Bad Request"): Response {
  return new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

