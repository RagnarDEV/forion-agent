import { LIMITS } from "../config.js";
import { UserError } from "../lib/errors.js";
import { BUILTIN_SKILLS } from "./builtin.js";
import { createRegistry } from "./registry.js";

export { BUILTIN_SKILLS } from "./builtin.js";
export { SKILL_MODES, sanitizeSkill, slugify, pickSkills } from "./registry.js";
export { buildSkillsContext } from "./context.js";

// يبني سجلًا خاصًا بالطلب الواحد (لا حالة مشتركة بين الطلبات):
// المدمجة أولًا، ثم مهارات المستخدم القادمة من الواجهة.
//  - عنصر كامل (له instructions) = مهارة مخصصة تُضاف أو تستبدل مهارة بالمعرّف نفسه.
//  - عنصر بلا instructions = تغيير وضع التفعيل لمهارة موجودة فقط: { id, mode }.
// المهارات غير الصالحة تُتجاهل ويُرجَع عددها، حتى لا تُعطّل بيانات تالفة كل المهام.
export function buildRegistry(clientSkills) {
  const registry = createRegistry();
  for (const definition of BUILTIN_SKILLS) registry.register(definition);

  const list = Array.isArray(clientSkills) ? clientSkills.slice(0, LIMITS.maxSkills + 60) : [];
  let skipped = 0;
  let custom = 0;
  let chars = 0;

  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      skipped++;
      continue;
    }

    const hasBody = typeof raw.instructions === "string" && raw.instructions.trim();

    if (!hasBody) {
      const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
      if (!registry.setMode(id, raw.mode)) skipped++;
      continue;
    }

    if (custom >= LIMITS.maxSkills) {
      skipped++;
      continue;
    }

    try {
      const skill = registry.register(raw);
      chars += skill.instructions.length;

      if (chars > LIMITS.maxSkillsTotalChars) {
        registry.unregister(skill.id);
        throw new UserError("حجم المهارات كبير.");
      }

      custom++;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      skipped++;
    }
  }

  return { registry, skipped };
}
