import { json } from "./http.js";
import { cleanSecret, normalizeToken, parseTokenList, safeEqual } from "./security.js";

// حماية من التخمين: بعد 8 محاولات خاطئة خلال 10 دقائق يُحظر العنوان مؤقتًا.
// الذاكرة هنا خاصة بكل نسخة Worker، فهي حماية إضافية وليست بديلًا عن رمز طويل عشوائي.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map();

function clientId(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

function retryAfter(id, now) {
  const entry = failures.get(id);
  if (!entry) return 0;

  if (now - entry.first > WINDOW_MS) {
    failures.delete(id);
    return 0;
  }

  return entry.count >= MAX_FAILURES
    ? Math.ceil((WINDOW_MS - (now - entry.first)) / 1000)
    : 0;
}

function recordFailure(id, now) {
  const entry = failures.get(id);

  if (!entry || now - entry.first > WINDOW_MS) {
    if (failures.size > 500) failures.clear();
    failures.set(id, { count: 1, first: now });
    return;
  }

  entry.count++;
}

// يُرجع Response عند الفشل، أو null عند نجاح المصادقة.
// يقبل الرمز في X-Admin-Token أو Authorization: Bearer، ويدعم عدة رموز في ADMIN_TOKEN.
export async function authenticate(request, env) {
  const tokens = parseTokenList(env.ADMIN_TOKEN);
  const missing = [];

  if (!tokens.length) missing.push("ADMIN_TOKEN");
  if (!cleanSecret(env.GITHUB_TOKEN)) missing.push("GITHUB_TOKEN");
  if (!env.AI) missing.push("ربط AI");

  if (missing.length) {
    return json({ error: "إعدادات الخادم ناقصة: " + missing.join("، ") }, 503);
  }

  const now = Date.now();
  const id = clientId(request);
  const wait = retryAfter(id, now);

  if (wait) {
    const response = json({
      error: "محاولات خاطئة كثيرة. أعد المحاولة بعد " + wait + " ثانية."
    }, 429);
    response.headers.set("Retry-After", String(wait));
    return response;
  }

  const supplied = normalizeToken(
    request.headers.get("X-Admin-Token") ||
    request.headers.get("Authorization") ||
    ""
  );

  let accepted = false;
  if (supplied) {
    for (const token of tokens) {
      if (await safeEqual(supplied, token)) accepted = true;
    }
  }

  if (accepted) {
    failures.delete(id);
    return null;
  }

  if (supplied) recordFailure(id, now);

  return json({
    error: "رمز الإدارة غير صحيح. تأكد من تطابقه مع ADMIN_TOKEN في إعدادات Cloudflare."
  }, 401);
}
