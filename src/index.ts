// @ts-ignore Wrangler imports the static HTML as a text module.
import home from "./home.html";
import { handleVisit } from "./visit.ts";
import type { Env } from "./visit.ts";

export { handleVisit } from "./visit.ts";
export type { Env } from "./visit.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);
    switch (pathname) {
      case "/":
        return new Response(home, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      case "/visit": {
        const header = request.headers.get("cf-connecting-ip") || "unknown";
        // Cloudflare supplies this header. Bound it even for local/test callers.
        const clientIp = /^[0-9a-f:.]{1,64}$/i.test(header) ? header : "unknown";
        return handleVisit(searchParams, env, clientIp);
      }
      default:
        return new Response("Not Found", { status: 404 });
    }
  },
};
