import { json } from "./lib/http.js";
import { authenticate } from "./lib/auth.js";
import { errorMessage, errorStatus } from "./lib/errors.js";
import { handleRepos } from "./routes/repos.js";
import { handleTask } from "./routes/task.js";
import { handleSkills } from "./routes/skills.js";
import { handleIcon, isIconPath } from "./routes/icons.js";

// الواجهة تُقدَّم من مجلد public بواسطة Cloudflare Workers Static Assets.
// هذا الملف مسؤول عن واجهة /api/* وأيقونات التطبيق وتوجيه الطلبات فقط.

const ROUTES = new Map([
  ["GET /api/repos", handleRepos],
  ["GET /api/skills", handleSkills],
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
      if (request.method === "GET" && isIconPath(url.pathname)) {
        return handleIcon(request, ctx);
      }
      return serveStatic(request, env);
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { "Allow": "GET, POST", "Cache-Control": "no-store" }
      });
    }

    const handler = ROUTES.get(request.method + " " + url.pathname);
    if (!handler) {
      return json({ error: "المسار غير موجود." }, 404);
    }

    const denied = await authenticate(request, env);
    if (denied) return denied;

    try {
      return await handler(request, env, ctx);
    } catch (error) {
      return json({ error: errorMessage(error) }, errorStatus(error));
    }
  }
};
