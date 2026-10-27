import { json } from "./lib/http.js";
import { authenticate } from "./lib/auth.js";
import { handleRepos } from "./routes/repos.js";
import { handleTask } from "./routes/task.js";

// الواجهة تُقدَّم من مجلد public بواسطة Cloudflare Workers Static Assets.
// هذا الملف مسؤول عن API وتوجيه الطلبات.

const ROUTES = new Map([
  ["GET /api/repos", handleRepos],
  ["POST /api/task", handleTask]
]);

function serveStatic(request, env) {
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

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

    // عرض الواجهة والملفات الثابتة.
    if (!url.pathname.startsWith("/api/")) {
      return serveStatic(request, env);
    }

    // السماح بالطرق المطلوبة فقط.
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: {
          "Allow": "GET, POST",
          "Cache-Control": "no-store"
        }
      });
    }

    const handler = ROUTES.get(
      request.method + " " + url.pathname
    );

    if (!handler) {
      return json({ error: "المسار غير موجود." }, 404);
    }

    // حماية API برمز الإدارة والتحقق من إعدادات الخادم.
    const denied = await authenticate(request, env);
    if (denied) return denied;

    try {
      return await handler(request, env, ctx);
    } catch (error) {
      return json({
        error: String(
          error?.message || error || "خطأ غير متوقع"
        ).slice(0, 600)
      }, 500);
    }
  }
};
