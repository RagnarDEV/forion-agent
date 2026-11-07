import { CANDIDATE_IDS } from "./catalog.js";
import { NeuronLedger } from "./ledger.js";
import { sanitizeStats } from "./stats.js";

// تنظيف مدخلات التوجيه القادمة من المتصفح (إعدادات، دفتر الاستهلاك، إحصاءات، ملف القدرات).
// كلها أعداد وأعلام فقط؛ أي شيء آخر يُهمل.

const REVIEW_MODES = ["off", "auto", "on"];
const OUTPUT_LIMIT_PARAMS = ["none", "max_tokens", "max_completion_tokens"];
export const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const obj = value => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const bounded = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

const freshAt = value => {
  if (typeof value !== "string" || !value) return true; // ملفات قديمة بلا وقت تبقى متوافقة للخلفية، ولا تُمدد صلاحيتها.
  const time = Date.parse(value);
  return Number.isFinite(time) && Date.now() - time <= PROFILE_TTL_MS;
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
    if (!freshAt(entry.at)) continue;

    profile.models[id] = {
      ok: entry.ok === true,
      requestOk: entry.requestOk === true || entry.ok === true,
      textExtracted: entry.textExtracted === true || entry.ok === true,
      jsonOk: entry.jsonOk === true,
      encodingOk: entry.encodingOk === true,
      outputLimitSupported: entry.outputLimitSupported === true || entry.acceptsMaxTokens === true || OUTPUT_LIMIT_PARAMS.slice(1).includes(entry.outputLimitParam),
      acceptsMaxTokens: entry.acceptsMaxTokens === true,
      outputLimitParam: OUTPUT_LIMIT_PARAMS.includes(entry.outputLimitParam)
        ? entry.outputLimitParam
        : (entry.acceptsMaxTokens === true ? "max_tokens" : "none"),
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
