import { CANDIDATE_IDS } from "./catalog.js";
import { NeuronLedger } from "./ledger.js";
import { sanitizeStats } from "./stats.js";

// تنظيف مدخلات التوجيه القادمة من المتصفح (إعدادات، دفتر الاستهلاك، إحصاءات، ملف القدرات).
// كلها أعداد وأعلام فقط؛ أي شيء آخر يُهمل.

const REVIEW_MODES = ["off", "auto", "on"];

const obj = value => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const bounded = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

export function normalizeRouterSettings(raw) {
  const source = obj(raw);

  return {
    // التبديل التلقائي عند الفشل (مفعّل افتراضيًا). Smart Auto هو الوضع الوحيد؛ التثبيت من الخادم فقط (PIN_MODEL).
    fallback: flag(source.fallback, true),
    review: REVIEW_MODES.includes(source.review) ? source.review : "auto",
    dailyBudget: bounded(source.dailyBudget, 500, 10000, 9000),
    taskBudget: bounded(source.taskBudget, 200, 10000, 4000)
  };
}

// ملف القدرات الناتج عن «اختبار التوافق». نموذج بلا ملف (غير GLM) لا يدخل في التوجيه.
export function sanitizeProfile(raw) {
  const profile = { models: {} };
  const models = obj(obj(raw).models);

  for (const id of CANDIDATE_IDS) {
    const entry = obj(models[id]);
    if (!Object.keys(entry).length) continue;

    profile.models[id] = {
      ok: entry.ok === true,
      jsonOk: entry.jsonOk === true,
      acceptsMaxTokens: entry.acceptsMaxTokens === true,
      latencyMs: bounded(entry.latencyMs, 0, 600000, 0),
      at: typeof entry.at === "string" ? entry.at.slice(0, 30) : ""
    };
  }

  return profile;
}

export function buildRouterContext(input, now = new Date()) {
  const source = obj(input);
  const settings = normalizeRouterSettings(source.settings);

  return {
    settings,
    ledger: new NeuronLedger(source.ledger, {
      dailyBudget: settings.dailyBudget,
      taskBudget: settings.taskBudget,
      now
    }),
    stats: sanitizeStats(source.stats),
    profile: sanitizeProfile(source.profile)
  };
}
