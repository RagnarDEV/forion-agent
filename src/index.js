import { json } from "./lib/http.js";
import { authenticate } from "./lib/auth.js";
import { handleRepos } from "./routes/repos.js";
import { handleTask } from "./routes/task.js";

// الواجهة (مجلد public) تُقدَّم من Workers Static Assets قبل الوصول إلى هذا الملف.
// هذا الملف مسؤول عن واجهة /api/* فقط.

const ROUTES = new Map([
  ["GET /api/repos", handleRepos],
  ["POST /api/task", handleTask]
]);

function serveStatic(request, env) {
  if (env.ASSETS) return env.ASSETS.fetch(request);

  return new Response(
    "الواجهة غير منشورة. تحقق من قسم [assets] في wrangler.toml ومن وجود مجلد public.",
    {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return serveStatic(request, env);
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const handler = ROUTES.get(request.method + " " + url.pathname);
    if (!handler) {
      return json({ error: "المسار غير موجود." }, 404);
    }

    const denied = await authenticate(request, env);
    if (denied) return denied;

    return handler(request, env, ctx);
  }
};
