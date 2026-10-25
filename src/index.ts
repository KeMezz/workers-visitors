/**
 * Cloudflare Worker: Visitor Counter
 *
 * Provides a public visitor counter badge backed by Cloudflare KV.
 * Input validation, page restrictions, and rate limiting protect against abuse and KV quota exhaustion.
 */

export interface Env {
  // Binding to Cloudflare KV for visitor counters
  view_counter: KVNamespace;
  // Optional comma-separated list of allowed page identifiers, full URLs, or wildcard domains (*.example.com)
  ALLOWED_PAGES?: string;
}

// @ts-ignore
import home from "./home.html";
import { makeBadge } from "./utils";
import {
  RateLimitEntry,
  checkRateLimit,
  isValidPageKey,
  isAllowedPage,
} from "./validator";

// In-memory rate limiting structures.
// NOTE: This runs in-memory per Cloudflare Worker isolate.
// Cloudflare Workers execute across hundreds of edge locations; hence this state is not globally durable
// or synchronized across isolates. However, it effectively prevents high-frequency burst abuse,
// denial-of-wallet, and KV write exhaustion within individual active isolates without requiring
// external centralized synchronization.
const ipLimits = new Map<string, RateLimitEntry>();
const pageLimits = new Map<string, RateLimitEntry>();

function handleHome(): Response {
  return new Response(home, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export async function handleVisit(
  searchParams: URLSearchParams,
  env: Env,
  clientIp: string = "unknown"
): Promise<Response> {
  const page = searchParams.get("page");
  if (!isValidPageKey(page)) {
    return handleBadRequest("Invalid page parameter. Must be non-empty, <= 256 characters, and contain safe characters.");
  }

  const validPage = page!.trim();

  if (!isAllowedPage(validPage, env.ALLOWED_PAGES)) {
    return new Response("Forbidden: Page is not authorized.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Rate limit: 60 requests per 60 seconds per IP
  const isIpAllowed = checkRateLimit(clientIp, ipLimits, 60, 60_000);
  // Rate limit: 20 writes per 10 seconds per page key
  const isPageAllowed = checkRateLimit(validPage, pageLimits, 20, 10_000);

  if (!isIpAllowed || !isPageAllowed) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": "10",
        "Content-Type": "text/plain; charset=utf-8",
      },
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

function handleNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    switch (pathname) {
      case "/":
        return handleHome();
      case "/visit":
        return handleVisit(searchParams, env, clientIp);
      default:
        return handleNotFound();
    }
  },
};
