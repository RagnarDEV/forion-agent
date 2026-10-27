import { json } from "../lib/http.js";
import { safeRepoName } from "../lib/security.js";
import { streamTask } from "../lib/stream.js";
import { LIMITS } from "../config.js";

function compactHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item => item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string")
    .slice(-LIMITS.maxHistoryItems)
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, LIMITS.maxHistoryChars)
    }));
}

export async function handleTask(request, env, ctx) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "جسم الطلب ليس JSON صالحًا." }, 400);
  }

  const repo = input && input.repo;
  const task = input && typeof input.task === "string" ? input.task.trim() : "";

  if (!safeRepoName(repo)) {
    return json({ error: "اسم المستودع غير صالح." }, 400);
  }
  if (!task) {
    return json({ error: "اكتب المهمة أولًا." }, 400);
  }

  // لا يُجري هذا المسار تحققًا من طول الرسالة.

  return streamTask(env, ctx, {
    repo,
    task,
    history: compactHistory(input.history)
  });
}