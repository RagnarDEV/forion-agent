import { state } from "./state.js";
import { store } from "./storage.js";

// تخزين التوجيه الذكي محليًا: الإعدادات، دفتر الاستهلاك اليومي، إحصاءات الأداء، وملف القدرات (نتيجة اختبار التوافق).
// لا يُحفظ هنا أي سر ولا أي محتوى مستودعات: أعداد وأعلام وأسماء نماذج فقط.

export const DEFAULT_ROUTER_SETTINGS = Object.freeze({
  fallback: true,
  review: "auto",
  dailyBudget: 9000,
  taskBudget: 4000
});

const REVIEW_MODES = ["off", "auto", "on"];
const KEY_PATTERN = /^@cf\/[A-Za-z0-9_.\-/]{1,80}\|(explore|select|generate|repair|review)\|(question|bugfix|refactor|feature|docs|ci|edit)$/;
const FIELDS = ["n", "ok", "fmt", "val", "to", "cap", "err", "lat", "neu", "nuse", "tokIn", "charsIn", "tokOut"];

const utcDay = () => new Date().toISOString().slice(0, 10);
const safe = value => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
const bounded = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const freshLedger = () => ({ day: utcDay(), neurons: 0, exhausted: false, approx: false });

export function loadRouterSettings() {
  let raw = {};
  try { raw = JSON.parse(store.local.get("router-settings") || "{}") || {}; } catch {}

  return {
    fallback: typeof raw.fallback === "boolean" ? raw.fallback : DEFAULT_ROUTER_SETTINGS.fallback,
    review: REVIEW_MODES.includes(raw.review) ? raw.review : DEFAULT_ROUTER_SETTINGS.review,
    dailyBudget: bounded(raw.dailyBudget, 500, 10000, DEFAULT_ROUTER_SETTINGS.dailyBudget),
    taskBudget: bounded(raw.taskBudget, 200, 10000, DEFAULT_ROUTER_SETTINGS.taskBudget)
  };
}

export const saveRouterSettings = settings => store.local.set("router-settings", JSON.stringify(settings));

export function loadRouterState() {
  let raw = {};
  try { raw = JSON.parse(store.local.get("router") || "{}") || {}; } catch {}

  // الدفتر يومي (UTC): يوم مختلف = دفتر جديد.
  const ledger = raw.ledger && raw.ledger.day === utcDay()
    ? { day: raw.ledger.day, neurons: safe(raw.ledger.neurons), exhausted: raw.ledger.exhausted === true, approx: raw.ledger.approx === true }
    : freshLedger();

  const stats = { entries: {} };
  const entries = raw.stats && raw.stats.entries && typeof raw.stats.entries === "object" ? raw.stats.entries : {};
  for (const [key, entry] of Object.entries(entries).slice(0, 150)) {
    if (!KEY_PATTERN.test(key) || !entry || typeof entry !== "object") continue;
    stats.entries[key] = Object.fromEntries(FIELDS.map(field => [field, safe(entry[field])]));
  }

  const profile = { models: {} };
  const models = raw.profile && raw.profile.models && typeof raw.profile.models === "object" ? raw.profile.models : {};
  for (const [id, entry] of Object.entries(models).slice(0, 4)) {
    if (!/^@cf\//.test(id) || !entry || typeof entry !== "object") continue;
    profile.models[id] = {
      ok: entry.ok === true,
      jsonOk: entry.jsonOk === true,
      acceptsMaxTokens: entry.acceptsMaxTokens === true,
      latencyMs: safe(entry.latencyMs),
      neurons: safe(entry.neurons),
      errors: Array.isArray(entry.errors) ? entry.errors.filter(text => typeof text === "string").slice(0, 4) : [],
      at: typeof entry.at === "string" ? entry.at.slice(0, 30) : ""
    };
  }

  return { ledger, stats, profile };
}

export function saveRouterState() {
  const { ledger, stats, profile } = state.router;
  store.local.set("router", JSON.stringify({ ledger, stats, profile }));
}

export function initRouterStore() {
  state.router.settings = loadRouterSettings();
  Object.assign(state.router, loadRouterState());
}

// الدفتر الحالي مع تدوير اليوم تلقائيًا (إن تغيّر يوم UTC أثناء بقاء الصفحة مفتوحة).
export function currentLedger() {
  if (!state.router.ledger || state.router.ledger.day !== utcDay()) {
    state.router.ledger = freshLedger();
    saveRouterState();
  }

  return state.router.ledger;
}

export function applyLedger(ledger) {
  if (!ledger || typeof ledger !== "object" || ledger.day !== utcDay()) return;

  state.router.ledger = {
    day: ledger.day,
    neurons: safe(ledger.neurons),
    exhausted: ledger.exhausted === true,
    approx: ledger.approx === true
  };
  saveRouterState();
}

export function applyStat(key, entry) {
  if (!KEY_PATTERN.test(key) || !entry || typeof entry !== "object") return;

  state.router.stats.entries[key] = Object.fromEntries(FIELDS.map(field => [field, safe(entry[field])]));
  saveRouterState();
}

export function applyProfile(report) {
  if (!report || typeof report !== "object" || !report.models) return;

  for (const [id, result] of Object.entries(report.models)) {
    state.router.profile.models[id] = {
      ok: result.ok === true,
      jsonOk: result.jsonOk === true,
      acceptsMaxTokens: result.acceptsMaxTokens === true,
      latencyMs: safe(result.latencyMs),
      neurons: safe(result.neurons),
      errors: Array.isArray(result.errors) ? result.errors.slice(0, 4) : [],
      at: typeof result.at === "string" ? result.at : ""
    };
  }

  saveRouterState();
}

export function resetRouterStats() {
  state.router.stats = { entries: {} };
  saveRouterState();
}

// ما يُرسل مع كل مهمة (الخادم يعيد تنظيفه ولا يثق به).
export function routerPayload() {
  return {
    settings: state.router.settings,
    ledger: currentLedger(),
    stats: state.router.stats,
    profile: state.router.profile
  };
}
