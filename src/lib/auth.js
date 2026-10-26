import { json } from "./http.js";
import { cleanSecret, safeEqual } from "./security.js";

// يُرجع Response عند الفشل، أو null عند نجاح المصادقة.
export async function authenticate(request, env) {
  const adminToken = cleanSecret(env.ADMIN_TOKEN);
  const missing = [];

  if (!adminToken) missing.push("ADMIN_TOKEN");
  if (!cleanSecret(env.GITHUB_TOKEN)) missing.push("GITHUB_TOKEN");
  if (!env.AI) missing.push("ربط AI");

  if (missing.length) {
    return json({ error: "إعدادات الخادم ناقصة: " + missing.join("، ") }, 503);
  }

  const supplied = cleanSecret(request.headers.get("X-Admin-Token"));

  if (!supplied || !(await safeEqual(supplied, adminToken))) {
    return json({
      error: "رمز الإدارة غير صحيح. تأكد من تطابقه مع ADMIN_TOKEN في إعدادات Cloudflare."
    }, 401);
  }

  return null;
}
