import { normalizeToken } from "./security.js";

// هوية المالك للمحادثات والمهام. النظام يعتمد رمز إدارة (ADMIN_TOKEN) لا حسابات مستخدمين،
// لذلك تُشتق الهوية من بصمة الرمز المقدَّم (SHA-256) ولا يُخزَّن الرمز نفسه.
// - كل رمز في قائمة ADMIN_TOKEN له مالك مستقل: محادثات أحدهم لا يراها الآخر.
// - عند تدوير الرمز تتغير الهوية؛ لإبقاء المحادثات عند التدوير عيّن OWNER_ID ثابتًا في الإعدادات.
export async function resolveOwner(request, env) {
  const fixed = String((env && env.OWNER_ID) || "").trim();
  if (fixed) return "owner:" + fixed.slice(0, 64);

  const supplied = normalizeToken(
    request.headers.get("X-Admin-Token") ||
    request.headers.get("Authorization") ||
    ""
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("forion-owner:" + supplied)
  );

  const hex = Array.from(new Uint8Array(digest).slice(0, 16))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  return "tok:" + hex;
}
