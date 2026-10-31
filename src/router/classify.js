import { LIMITS } from "../config.js";
import { normalizeTask, requestsNoChanges } from "../lib/intent.js";

// تحليل المهمة: نوعها وتعقيدها وحجم السياق المتوقع. يعتمد على نص الطلب وحجم المستودع الممسوح فقط
// (لا على أي محتوى ملفات)، وناتجه يُستخدم للتوجيه ولتصنيف الإحصاءات.

const PATTERNS = [
  ["ci", /(?:^|[^a-z])(?:ci|workflow|actions|pipeline)(?:$|[^a-z])|فحوصات|سير العمل/],
  ["docs", /readme|docs?\b|documentation|توثيق|شرح الكود في الملف/],
  ["refactor", /refactor|restructure|reorganize|cleanup|clean up|اعادة هيكل|رتب|نظف|تنظيم|فصل/],
  ["bugfix", /\bbug\b|bugs|\bfix\b|crash|error|fails?|broken|اصلح|خطا|اخطاء|مشكل|لا يعمل|يتعطل|تعطل/],
  ["feature", /\badd\b|implement|\bbuild\b|feature|create|اضف|انشئ|اضافة|ميزه|ميزة|طور|نفذ/]
];

// \b لا تعمل مع الحروف العربية، فنستخدم (?=\s|$) لنهاية الكلمة.
const QUESTION = /(?:^|\s)(?:اشرح|لماذا|كيف|ما هو|ما هي|explain|why|how|what)(?=\s|$)/;

// مسارات ملفات مذكورة صراحةً في الطلب (تقدير لعدد الملفات).
const PATH_MENTION = /[A-Za-z0-9_@.\-/]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|css|html|md|py|go|rs|java|yml|yaml|toml|sh)\b/g;

export function classifyTask({ task, scan = null } = {}) {
  const text = normalizeTask(typeof task === "string" ? task : "");
  const readOnly = requestsNoChanges(task);

  let kind = "edit";
  for (const [name, pattern] of PATTERNS) {
    if (pattern.test(text)) {
      kind = name;
      break;
    }
  }

  // أسئلة وتحليل: لا فعل تعديل في الطلب أو طُلب صراحةً بلا تغييرات.
  if (readOnly || (kind === "edit" && QUESTION.test(text))) kind = "question";

  const mentioned = new Set(text.match(PATH_MENTION) || []).size;
  const taskChars = text.length;
  const repoBytes = scan && Number.isFinite(scan.totalBytes) ? scan.totalBytes : 0;

  let score = 0;
  if (taskChars > 600) score += 1;
  if (taskChars > 2500) score += 1;
  if (mentioned >= 3) score += 1;
  if (mentioned >= 6) score += 1;
  if (kind === "refactor" || kind === "feature") score += 1;
  if (kind === "ci") score += 1;
  if (repoBytes > 150000) score += 1;

  const complexity = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  const filesEstimate = Math.max(
    mentioned,
    complexity === "high" ? 8 : complexity === "medium" ? 4 : 1
  );

  return {
    kind,
    complexity,
    readOnly,
    filesEstimate: Math.min(filesEstimate, LIMITS.maxSelectFiles),
    contextChars: Math.min(repoBytes, LIMITS.maxTotalBytes) + taskChars,
    // استدلال أعمق: مهام معقدة، أو إصلاح فحوصات متعددة الملفات.
    deepReasoning: complexity === "high" || (kind === "ci" && complexity !== "low"),
    // كل مراحل الخط تتطلب JSON صارمًا (بروتوكول JSON، لا Function Calling الأصلي).
    needsJson: true,
    needsNativeTools: false
  };
}
