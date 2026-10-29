import { state } from "./state.js";

const NET_BEFORE = "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.";
const NET_DURING = "انقطع الاتصال أثناء التنفيذ. إن ظهر فرع جديد في GitHub فقد اكتمل جزء من العمل؛ تحقق منه ثم أعد المحاولة.";

// إلغاء بطلب المستخدم (زر الإيقاف)، وليس خطأً.
export class AbortedError extends Error {
  constructor() {
    super("أُوقفت المهمة.");
    this.name = "AbortedError";
    this.aborted = true;
  }
}

// خطأ مصادقة (401/429) لتمييزه عن بقية الأخطاء، مثلًا عند الدخول التلقائي.
export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

async function parse(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("استجابة غير صالحة من الخادم (HTTP " + response.status + ").");
  }
}

export async function apiGet(path) {
  let response;
  try {
    response = await fetch(path, { headers: { "X-Admin-Token": state.token } });
  } catch {
    throw new Error(NET_BEFORE);
  }

  const data = await parse(response);

  if (!response.ok) {
    const message = (data.error || "فشل الطلب") + " (HTTP " + response.status + ")";
    if (response.status === 401 || response.status === 429) throw new AuthError(message, response.status);
    throw new Error(message);
  }

  return data;
}

// يقرأ بث NDJSON: أحداث stage/note/ping ثم result أو error.
// extras: { signal, options, skills } (الإعدادات والمهارات من لوحة الإعدادات).
export async function runTask(repo, task, history, onEvent, extras = {}) {
  const { signal, options, skills } = extras;
  let response;

  try {
    response = await fetch("/api/task", {
      method: "POST",
      headers: { "X-Admin-Token": state.token, "Content-Type": "application/json" },
      body: JSON.stringify({ repo, task, history, options, skills }),
      signal
    });
  } catch {
    if (signal && signal.aborted) throw new AbortedError();
    throw new Error(NET_BEFORE);
  }

  const type = response.headers.get("Content-Type") || "";
  if (!type.includes("ndjson") || !response.body) {
    const data = await parse(response).catch(() => ({}));
    throw new Error((data.error || "استجابة غير متوقعة من الخادم") + " (HTTP " + response.status + ")");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final = null;

  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      if (signal && signal.aborted) throw new AbortedError();
      throw new Error(NET_DURING);
    }
    if (chunk.done) break;

    buffer += decoder.decode(chunk.value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;

      let event;
      try { event = JSON.parse(line); } catch { continue; }

      if (event.type === "result") final = event;
      else if (event.type === "error") throw new Error(event.error || "فشل التنفيذ");
      else onEvent(event);
    }
  }

  if (signal && signal.aborted) throw new AbortedError();
  if (!final) throw new Error("انتهى الاتصال قبل وصول النتيجة. أعد المحاولة.");
  return final;
}
