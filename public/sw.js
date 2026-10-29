// Service Worker: يجعل الواجهة تعمل كتطبيق (shell مخزّن) دون تخزين أي استجابة API.
// الاستراتيجية: الشبكة أولًا (تصل التحديثات فورًا) ثم النسخة المخزنة عند انقطاع الاتصال.
const CACHE = "forion-shell-v1";
const CORE = [
  "/",
  "/css/tokens.css",
  "/css/base.css",
  "/css/components.css",
  "/css/chat.css",
  "/css/motion.css",
  "/css/settings.css",
  "/favicon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(CORE.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit =>
        hit || (request.mode === "navigate" ? caches.match("/") : Response.error())
      ))
  );
});
