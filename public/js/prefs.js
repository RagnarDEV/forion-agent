import { store } from "./storage.js";

// ───────── الإعدادات ─────────
// القيم الافتراضية للمهام. الاستكشاف الذكي وفحص CI مفعّلان لأنهما يرفعان نسبة إنجاز المهام.
export const DEFAULT_PREFS = Object.freeze({
  agentic: true,
  ciRepair: true,
  allowCreate: true,
  attempts: 4,
  repairRounds: 2
});

const clamp = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);

export function loadPrefs() {
  let raw = {};
  try { raw = JSON.parse(store.local.get("prefs") || "{}") || {}; } catch {}

  return {
    agentic: flag(raw.agentic, DEFAULT_PREFS.agentic),
    ciRepair: flag(raw.ciRepair, DEFAULT_PREFS.ciRepair),
    allowCreate: flag(raw.allowCreate, DEFAULT_PREFS.allowCreate),
    attempts: clamp(raw.attempts, 1, 8, DEFAULT_PREFS.attempts),
    repairRounds: clamp(raw.repairRounds, 0, 4, DEFAULT_PREFS.repairRounds)
  };
}

export const savePrefs = prefs => store.local.set("prefs", JSON.stringify(prefs));

// ───────── المهارات ─────────
// المخصصة تُحفظ كاملة؛ وللمدمجة نحفظ وضع التفعيل فقط (auto | always | off).
const MODES = ["auto", "always", "off"];
const isObject = value => value && typeof value === "object" && !Array.isArray(value);

export function loadSkillState() {
  let raw = {};
  try { raw = JSON.parse(store.local.get("skills") || "{}") || {}; } catch {}

  const modes = {};
  if (isObject(raw.modes)) {
    for (const [id, mode] of Object.entries(raw.modes)) if (MODES.includes(mode)) modes[id] = mode;
  }

  return {
    custom: Array.isArray(raw.custom) ? raw.custom.filter(isObject).slice(0, 40) : [],
    modes
  };
}

export const saveSkillState = skillState => store.local.set("skills", JSON.stringify(skillState));

// الصيغة المُرسلة للخادم: المخصصة كاملة، ثم أوضاع المدمجة.
export function skillsPayload(skillState) {
  const custom = skillState.custom.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: skill.tags,
    instructions: skill.instructions,
    mode: skill.mode
  }));
  const modes = Object.entries(skillState.modes).map(([id, mode]) => ({ id, mode }));

  return [...custom, ...modes];
}

// ───────── رمز الإدارة ─────────
// يُحفظ للجلسة (sessionStorage) حتى لا يُطلب عند تحديث الصفحة، ويُحفظ على الجهاز
// (localStorage) لمدة 30 يومًا فقط إن اختار المستخدم «تذكّرني».
const TOKEN_DAYS = 30;

// نفس منطق الخادم (normalizeToken): يزيل المسافات والأسطر والاقتباس وبادئة Bearer.
export function normalizeToken(value) {
  return String(value || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .trim()
    .replace(/^bearer\s+/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");
}

export function loadSavedToken() {
  const session = store.session.get("token");
  if (session) return { token: session, remember: Boolean(store.local.get("token")) };

  try {
    const saved = JSON.parse(store.local.get("token") || "null");
    if (saved && typeof saved.value === "string" && saved.exp > Date.now()) {
      return { token: saved.value, remember: true };
    }
  } catch {}

  store.local.remove("token");
  return null;
}

export function saveToken(token, remember) {
  store.session.set("token", token);

  if (remember) {
    store.local.set("token", JSON.stringify({ value: token, exp: Date.now() + TOKEN_DAYS * 86400000 }));
  } else {
    store.local.remove("token");
  }
}

export function forgetToken() {
  store.session.remove("token");
  store.local.remove("token");
}

export const isTokenRemembered = () => {
  try {
    const saved = JSON.parse(store.local.get("token") || "null");
    return Boolean(saved && saved.exp > Date.now());
  } catch {
    return false;
  }
};
