import { LIMITS } from "../config.js";
import { UserError } from "../lib/errors.js";
import { normalizeTask } from "../lib/intent.js";

// المهارة = تعليمات إضافية تُحقن في طلب النموذج عند الحاجة.
// أوضاع التفعيل: auto (حسب كلمات التفعيل) | always (دائمًا) | off (معطّلة).

export const SKILL_MODES = Object.freeze(["auto", "always", "off"]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LATIN_TERM = /^[a-z0-9][a-z0-9-]*$/;

const clean = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export const normalizeMode = (mode, fallback = "auto") =>
  SKILL_MODES.includes(mode) ? mode : fallback;

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

// يتحقق من تعريف مهارة ويُرجع نسخة نظيفة منه، أو يرمي UserError برسالة مفهومة.
export function sanitizeSkill(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new UserError("تعريف المهارة غير صالح.");
  }

  const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
  if (!ID_PATTERN.test(id)) {
    throw new UserError("معرّف المهارة غير صالح (أحرف إنجليزية صغيرة وأرقام وشرطات): " + String(raw.id).slice(0, 50));
  }

  const name = clean(raw.name, 80) || id;
  const instructions = clean(raw.instructions, LIMITS.maxSkillChars);
  if (!instructions) throw new UserError("المهارة «" + name + "» بلا تعليمات.");

  const tags = [...new Set(
    (Array.isArray(raw.tags) ? raw.tags : [])
      .filter(tag => typeof tag === "string")
      .map(tag => tag.trim().toLowerCase().slice(0, 40))
      .filter(Boolean)
  )].slice(0, 12);

  return {
    id,
    name,
    description: clean(raw.description, 300),
    tags,
    instructions,
    mode: normalizeMode(raw.mode)
  };
}

const copy = skill => ({ ...skill, tags: [...skill.tags] });

export class SkillsRegistry {
  #skills = new Map();

  register(definition) {
    const skill = sanitizeSkill(definition);
    this.#skills.set(skill.id, skill);
    return copy(skill);
  }

  unregister(id) {
    return this.#skills.delete(id);
  }

  has(id) {
    return this.#skills.has(id);
  }

  get(id) {
    const skill = this.#skills.get(id);
    return skill ? copy(skill) : null;
  }

  list() {
    return [...this.#skills.values()].map(copy);
  }

  setMode(id, mode) {
    const skill = this.#skills.get(id);
    if (!skill || !SKILL_MODES.includes(mode)) return false;

    skill.mode = mode;
    return true;
  }
}

export const createRegistry = () => new SkillsRegistry();

function termMatches(term, text) {
  if (!term) return false;

  // الكلمات اللاتينية تُطابَق ككلمة كاملة؛ العربية وغيرها بالاحتواء (البادئات مثل و/ب/ل شائعة).
  if (LATIN_TERM.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9])" + escaped + "($|[^a-z0-9])").test(text);
  }

  return text.includes(term);
}

// المهارات الفعّالة لطلب: كل "always" + كل "auto" يظهر معرّفها أو اسمها أو أحد وسومها في الطلب.
export function pickSkills(registry, task) {
  const text = normalizeTask(task);

  return registry.list().filter(skill => {
    if (skill.mode === "off") return false;
    if (skill.mode === "always") return true;

    return [skill.id, skill.name, ...skill.tags]
      .map(term => normalizeTask(term).trim())
      .some(term => termMatches(term, text));
  });
}
