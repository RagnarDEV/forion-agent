import { json } from "./lib/http.js";
import { authenticate } from "./lib/auth.js";
import { resolveOwner } from "./lib/owner.js";
import { errorMessage, errorStatus } from "./lib/errors.js";
import { handleRepos } from "./routes/repos.js";
import { handleTask } from "./routes/task.js";
import { handleSkills } from "./routes/skills.js";
import { handleProbe } from "./routes/router.js";
import { handleIcon, isIconPath } from "./routes/icons.js";
import { matchConversationRoute } from "./routes/conversations.js";

// الواجهة تُقدَّم من مجلد public بواسطة Cloudflare Workers Static Assets.
// هذا الملف مسؤول عن واجهة /api/* وأيقونات التطبيق وتوجيه الطلبات فقط.

const ROUTES = new Map([
  ["GET /api/repos", handleRepos],
  ["GET /api/skills", handleSkills],
  ["POST /api/task", handleTask],
  ["POST /api/router/probe", handleProbe]
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

function notAllowed(allow) {
  return new Response("Method not allowed", {
    status: 405,
    headers: { "Allow": allow, "Cache-Control": "no-store" }
  });
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

    // مسارات المحادثات تدعم GET/POST/PATCH/DELETE؛ بقية المسارات GET/POST كما كانت.
    const conversationRoute = matchConversationRoute(url.pathname);
    let handler;
    let params = {};

    if (conversationRoute) {
      handler = conversationRoute.handlers[request.method];
      if (!handler) return notAllowed(conversationRoute.allow.join(", "));
      params = { id: conversationRoute.id };
    } else {
      if (request.method !== "GET" && request.method !== "POST") {
        return notAllowed("GET, POST");
      }

      handler = ROUTES.get(request.method + " " + url.pathname);
      if (!handler) {
        return json({ error: "المسار غير موجود." }, 404);
      }
    }

    const denied = await authenticate(request, env);
    if (denied) return denied;

    try {
      if (conversationRoute) params.ownerId = await resolveOwner(request, env);
      return await handler(request, env, ctx, params);
    } catch (error) {
      return json({ error: errorMessage(error) }, errorStatus(error));
    }
  }
};
