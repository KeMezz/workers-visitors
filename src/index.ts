/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  view_counter: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
}

// @ts-ignore
import home from "./home.html";
import { makeBadge } from "./utils";

function handleHome() {
  return new Response(home, {
    headers: {
      "Content-Type": "text/html;chartset=utf-8",
    },
  });
}

async function handleVisit(searchParams: URLSearchParams, env: Env) {
  const page = searchParams.get("page");
  if (!page) {
    return handleBadRequest();
  }

  const kvPage = await env.view_counter.get(page);
  let value = 1;
  if (!kvPage) {
    await env.view_counter.put(page, value + "");
  } else {
    value = parseInt(kvPage) + 1;
    await env.view_counter.put(page, value + "");
  }
  return new Response(makeBadge(value), {
    headers: { "Content-Type": "image/svg+xml;chartset=utf-8" },
  });
}

function handleBadRequest() {
  return new Response(null, { status: 400 });
}

function handleNotFound() {
  return new Response(null, { status: 404 });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);
    switch (pathname) {
      case "/":
        return handleHome();
      case "/visit":
        return handleVisit(searchParams, env);
      default:
        return handleNotFound();
    }
  },
};
