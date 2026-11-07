import { observedRatios } from "./usage.js";

// إحصاءات أداء النماذج حسب (نموذج | مرحلة | نوع مهمة).
// تحوي أعدادًا ومجاميع فقط: لا أسرار ولا نصوص ولا محتوى مستودعات ولا أسماء ملفات.
// يحتفظ بها المتصفح ويُرسلها مع كل مهمة؛ الخادم يُعيد الإدخال المتغيّر فقط (حدث stat).

export const STAGES = Object.freeze(["explore", "select", "generate", "repair", "review"]);
export const TASK_CLASSES = Object.freeze(["question", "bugfix", "refactor", "feature", "docs", "ci", "edit"]);

const MAX_ENTRIES = 150;
const KEY_PATTERN = new RegExp(
  "^@cf/[A-Za-z0-9_.\\-/]{1,80}\\|(" + STAGES.join("|") + ")\\|(" + TASK_CLASSES.join("|") + ")$"
);

// ok: أنتج ناتجًا صالحًا بعد التحقق | fmt: JSON/تنسيق غير صالح | val: ناتج مرفوض بقواعد التحقق
// to: مهلة | cap: نفاد سعة | err: خطأ آخر
const FIELDS = ["n", "ok", "fmt", "val", "to", "cap", "err", "lat", "neu", "nuse", "tokIn", "charsIn", "tokOut"];
const OUTCOME_FIELD = { ok: "ok", format: "fmt", validation: "val", timeout: "to", capacity: "cap", error: "err" };

const blank = () => Object.fromEntries(FIELDS.map(field => [field, 0]));
const safe = value => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(value, 1e9) : 0);

export const emptyStats = () => ({ entries: {} });
export const statKey = (model, stage, cls) => model + "|" + stage + "|" + cls;

// تنظيف ما يأتي من المتصفح: مفاتيح صالحة فقط، وأعداد محدودة.
export function sanitizeStats(raw) {
  const clean = emptyStats();
  if (!raw || typeof raw !== "object" || !raw.entries || typeof raw.entries !== "object") return clean;

  for (const [key, entry] of Object.entries(raw.entries).slice(0, MAX_ENTRIES)) {
    if (!KEY_PATTERN.test(key) || !entry || typeof entry !== "object") continue;

    clean.entries[key] = Object.fromEntries(FIELDS.map(field => [field, safe(entry[field])]));
  }

  return clean;
}

// يسجّل نتيجة واحدة ويُرجع الإدخال المحدَّث. تتناقص الأوزان القديمة (نصف القيم عند تجاوز 60 عينة).
export function recordOutcome(stats, { key, outcome, latencyMs = 0, neurons = 0, usage = null, promptChars = 0 }) {
  const field = OUTCOME_FIELD[outcome];
  if (!field || !KEY_PATTERN.test(key)) return null;

  if (!stats.entries[key] && Object.keys(stats.entries).length >= MAX_ENTRIES) return null;

  const entry = stats.entries[key] || (stats.entries[key] = blank());

  entry.n += 1;
  entry[field] += 1;
  entry.lat += safe(latencyMs);
  entry.neu += safe(neurons);

  if (usage && usage.known) {
    entry.nuse += 1;
    entry.tokIn += safe(usage.inputTokens);
    entry.charsIn += safe(promptChars);
    entry.tokOut += safe(usage.outputTokens);
  }

  if (entry.n > 60) {
    for (const name of FIELDS) entry[name] *= 0.5;
  }

  return entry;
}

// الحد الأدنى لفاصل ثقة ويلسون لنسبة النجاح (z=1.28 ≈ 90%): يمنع الحكم من عينات قليلة.
export function wilsonLowerBound(successes, total, z = 1.28) {
  if (total <= 0) return 0;

  const p = successes / total;
  const z2 = z * z;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  return Math.max(0, (center - margin) / (1 + z2 / total));
}

// مقاييس مقروءة لإدخال واحد (أو null بلا عينات).
export function measure(entry) {
  if (!entry || entry.n <= 0) return null;

  return {
    samples: entry.n,
    successRate: entry.ok / entry.n,
    confidentRate: wilsonLowerBound(entry.ok, entry.n),
    avgLatencyMs: entry.lat / entry.n,
    avgNeurons: entry.neu / entry.n,
    formatErrors: entry.fmt,
    timeouts: entry.to
  };
}

// نسب الاستهلاك الفعلي لنموذج عبر كل مراحله (تدخل في تقدير التكلفة قبل الاستدعاء).
export function observedUsage(stats, model) {
  const entries = Object.entries(stats.entries)
    .filter(([key]) => key.startsWith(model + "|"))
    .map(([, entry]) => entry);

  return observedRatios(entries);
}

// ملخص لكل نموذج ومرحلة لعرضه في الواجهة.
export function summarize(stats) {
  const rows = [];

  for (const [key, entry] of Object.entries(stats.entries)) {
    const [model, stage, cls] = key.split("|");
    const m = measure(entry);
    if (m) rows.push({ model, stage, cls, ...m });
  }

  return rows;
}
