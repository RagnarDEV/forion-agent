import { json } from "../lib/http.js";
import { BUILTIN_SKILLS } from "../skills/builtin.js";

// كتالوج المهارات المدمجة (تعليماتها كاملة) لتعرضه الواجهة وتتيح نسخه وتعديله.
export function handleSkills() {
  return json({
    skills: BUILTIN_SKILLS.map(skill => ({ ...skill, tags: [...skill.tags] }))
  });
}
