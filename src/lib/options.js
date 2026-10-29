import { RETRY } from "../config.js";

// خيارات المهمة الواحدة (تأتي من لوحة الإعدادات). الافتراضي هنا محافظ:
// الميزات الإضافية (الاستكشاف وفحص CI) تُفعَّل صراحةً من الواجهة.

const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.round(number)))
    : fallback;
};

export function normalizeOptions(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  return {
    agentic: flag(source.agentic, false),
    ciRepair: flag(source.ciRepair, false),
    allowCreate: flag(source.allowCreate, true),
    attempts: clamp(source.attempts, 1, RETRY.maxAttempts, RETRY.generateAttempts),
    repairRounds: clamp(source.repairRounds, 0, RETRY.maxRepairRounds, RETRY.repairRounds)
  };
}
