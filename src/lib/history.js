// سجل المحادثة: يُرجع آخر الرسائل الصالحة ضمن ميزانية أحرف، مع ضمان تناوب الأدوار.

const isValid = item =>
  item &&
  (item.role === "user" || item.role === "assistant") &&
  typeof item.content === "string" &&
  item.content.trim();

export function recentMessages(history, limit = 4, maxChars = Infinity) {
  if (!Array.isArray(history) || limit <= 0 || maxChars <= 0) return [];

  const picked = [];
  let total = 0;

  for (let i = history.length - 1; i >= 0 && picked.length < limit; i--) {
    const item = history[i];
    if (!isValid(item)) continue;

    const remaining = maxChars - total;
    if (item.content.length > remaining) {
      // الرسالة الأحدث وحدها قد تتجاوز الميزانية: نُبقي ذيلها بدل إسقاطها.
      if (!picked.length) picked.unshift({ role: item.role, content: item.content.slice(-remaining) });
      break;
    }

    picked.unshift({ role: item.role, content: item.content });
    total += item.content.length;
  }

  // المحادثة يجب أن تبدأ برسالة مستخدم، وتُدمج الرسائل المتتالية من الدور نفسه.
  while (picked.length && picked[0].role !== "user") picked.shift();

  const merged = [];
  for (const item of picked) {
    const last = merged[merged.length - 1];
    if (last && last.role === item.role) last.content += "\n\n" + item.content;
    else merged.push({ ...item });
  }

  return merged;
}

// يبني قائمة رسائل النموذج: system ثم السجل ثم طلب المستخدم الحالي.
// إن انتهى السجل برسالة مستخدم تُدمج معها لتجنب رسالتين متتاليتين من المستخدم.
export function chatMessages(system, history, userContent, { limit = 8, maxChars = Infinity } = {}) {
  const past = recentMessages(history, limit, maxChars);
  const messages = [{ role: "system", content: system }, ...past];
  const last = past[past.length - 1];

  if (last && last.role === "user") last.content += "\n\n" + userContent;
  else messages.push({ role: "user", content: userContent });

  return messages;
}
