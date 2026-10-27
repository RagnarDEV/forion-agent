// قواعد اختيار الملفات النصية الآمنة للقراءة والتعديل.

const SOURCE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|html|css|py|go|rs|java|php|sh)$/i;
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|html|css|json|md|txt|yml|yaml|toml|py|go|rs|java|php|sql|sh|xml|svg|robot)(?:\.\w+)?$/i;

export function isSafeTextPath(path) {
  if (typeof path !== "string" || !path || path.length > 240) return false;

  if (path.startsWith("/") || path.includes("\\") ||
      path.split("/").some(part => !part || part === "." || part === "..")) {
    return false;
  }

  if (/(^|\/)\.env($|\.)/i.test(path)) return false;
  if (/(^|\/)(secrets?|credentials?)(\/|\.|$)/i.test(path)) return false;
  if (/(^|\/)(node_modules|vendor|dist|build|coverage|\.git)\//i.test(path)) return false;
  if (/(^|\/)\.github\/workflows\//i.test(path)) return false;
  if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock)$/i.test(path)) return false;
  if (/\.(min\.js|min\.css|map)$/i.test(path)) return false;

  return TEXT_EXT.test(path);
}

// ملفات الشيفرة أولًا، ثم الأقل عمقًا، ثم الترتيب الأبجدي.
export function rankCandidates(a, b) {
  const sa = SOURCE_EXT.test(a.path) ? 0 : 1;
  const sb = SOURCE_EXT.test(b.path) ? 0 : 1;
  if (sa !== sb) return sa - sb;

  const da = a.path.split("/").length;
  const db = b.path.split("/").length;
  if (da !== db) return da - db;

  return a.path.localeCompare(b.path);
}