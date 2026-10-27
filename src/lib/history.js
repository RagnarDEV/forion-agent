// يُرجع آخر رسائل المحادثة الصالحة فقط (user/assistant بنص).

export function recentMessages(history, limit = 4) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item => item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string")
    .slice(-limit)
    .map(item => ({ role: item.role, content: item.content }));
}
