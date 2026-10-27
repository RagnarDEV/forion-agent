import { LIMITS } from '../config.js';

/**
 * يبني السياق الاستراتيجي للمهارات.
 * يضمن أن المهارات القوية تؤثر على النموذج بصورة صحيحة، بينما المهارات العامة لا تضخم السياق.
 */
export function buildSkillsContext(skillsToLoad, originalTask) {
  if (!Array.isArray(skillsToLoad) || skillsToLoad.length === 0) {
    return '';
  }

  // ترتيب ثابت (Permanent Order): System > Security > Code Quality > Feature
  // Priority may change
  const priorityOrder = ['security', 'performance', 'style', 'feature'];
  const orderedSkills = [...skillsToLoad].sort((a, b) => {
    const A = (a.tags || []).find(tag => priorityOrder.includes(tag));
    const B = (b.tags || []).find(tag => priorityOrder.includes(tag));
    if (A === B) return 0;
    if (A && !B) return -1;
    if (!A && B) return 1;
    return 0;
  });

  const contextParts = ['## Active Skills'];

  for (const skill of orderedSkills) {
    if (!skill.instructionStrength) {
      const tagsStr = (skill.tags || []).filter(t => typeof t === 'string').join(', ');
      contextParts.push(`### Skill: ${skill.name} (${tagsStr})`);
    }
    contextParts.push(skill.fullInstructions || 'No detailed instructions loaded.');
    contextParts.push('---');
  }

  let contextStr = contextParts.join('\n');
  const contextBytes = new TextEncoder().encode(contextStr).length;

  if (contextBytes > LIMITS.maxNewFiles * 5000) {
    // إذا كان حجم السياق كبير جداً بسبب إدخال مستخدم سيئ.
    // طبّق خوارزمية عشوائية لتقليل ثقل الحمل.
    const skipCount = Math.floor(orderedSkills.length / 2);
    const randomSubset = orderedSkills
      .sort(() => Math.random() - 0.5)
      .slice(0, skipCount)
      .map(s => ({ ...s, instructionStrength: 'lazy' }));

    return buildSkillsContext(randomSubset, originalTask);
  }

  // قواعد أولوية
  return `ACTIVE SKILL SELECTION (User Request Context):
${contextStr}

REQUIREMENTS based on request:
Original Request: ${String(originalTask).slice(0, 1000)}`;
}
