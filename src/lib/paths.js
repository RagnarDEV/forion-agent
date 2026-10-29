// قواعد اختيار الملفات النصية الآمنة للقراءة والتعديل.
//
// الممنوع فقط: الأسرار (.env وما شابهها)، مجلدات التبعيات والبناء و.git،
// الملفات المولَّدة (lockfiles و min و map)، والمسارات الخطرة (.. والمطلقة).
// ملفات .github/workflows والإعدادات (wrangler.toml, package.json) مسموحة
// حتى يتمكن الوكيل من تطوير نفسه.

const SOURCE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte|html|css|py|go|rs|java|kt|rb|php|sh)$/i;
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte|html|css|scss|less|json|jsonc|md|mdx|txt|yml|yaml|toml|ini|cfg|conf|py|go|rs|java|kt|rb|php|sql|sh|xml|svg|webmanifest|graphql)$/i;
const TEXT_NAMES = /(^|\/)(\.gitignore|\.editorconfig|\.prettierrc|\.eslintrc|\.nvmrc|dockerfile|makefile|license|cname|_headers|_redirects)$/i;

export function isSafeTextPath(path) {
  if (typeof path !== "string" || !path || path.length > 240) return false;

  if (path.startsWith("/") || path.includes("\\") ||
      path.split("/").some(part => !part || part === "." || part === "..")) {
    return false;
  }

  if (/(^|\/)\.env($|\.)/i.test(path)) return false;
  if (/(^|\/)(secrets?|credentials?)(\/|\.|$)/i.test(path)) return false;
  if (/(^|\/)(node_modules|vendor|dist|build|coverage|\.wrangler|\.git)\//i.test(path)) return false;
  if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock)$/i.test(path)) return false;
  if (/\.(min\.js|min\.css|map)$/i.test(path)) return false;

  return TEXT_EXT.test(path) || TEXT_NAMES.test(path);
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
