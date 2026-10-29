import { renderIcon } from "../lib/png.js";

// أيقونات التطبيق القابل للتثبيت (PWA): تُولَّد عند الطلب وتُخزَّن مؤقتًا في Cache API.
const ICONS = new Map([
  ["icon-180.png", { size: 180, maskable: false }],
  ["icon-192.png", { size: 192, maskable: false }],
  ["icon-512.png", { size: 512, maskable: false }],
  ["maskable-512.png", { size: 512, maskable: true }]
]);

const PREFIX = "/icons/";

export const isIconPath = pathname =>
  pathname.startsWith(PREFIX) && ICONS.has(pathname.slice(PREFIX.length));

export async function handleIcon(request, ctx) {
  const url = new URL(request.url);
  const name = url.pathname.slice(PREFIX.length);
  const spec = ICONS.get(name);

  if (!spec) return new Response("Not found", { status: 404 });

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url.origin + PREFIX + name);

  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }

  const png = await renderIcon(spec.size, { maskable: spec.maskable });
  const response = new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });

  if (cache && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(cache.put(key, response.clone()));
  }

  return response;
}
