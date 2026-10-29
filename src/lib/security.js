// أدوات الأمان: تنظيف الأسرار، مقارنة بزمن ثابت، والتحقق من اسم المستودع.

export function cleanSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}

// يوحّد شكل رمز الإدارة: يزيل الأحرف غير المرئية والمسافات والأسطر
// والاقتباس وبادئة "Bearer"، فيعمل اللصق من أي مصدر دون أخطاء مطبعية.
export function normalizeToken(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .trim()
    .replace(/^bearer\s+/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");
}

// ADMIN_TOKEN قد يحوي عدة رموز مفصولة بسطر أو فاصلة (لتدوير الرمز دون انقطاع).
export function parseTokenList(value) {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map(normalizeToken)
    .filter(Boolean);
}

export async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

export function safeRepoName(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}
