import { DEFAULT_MODEL } from "../config.js";
import { UserError } from "./errors.js";
import { cleanSecret } from "./security.js";

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new UserError(
      "انتهت مهلة " + label + " (" + Math.round(ms / 1000) +
      " ثانية). قلّل نطاق الطلب أو حدّد الملفات المطلوبة بالاسم ثم أعد المحاولة."
    )), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function parseModelJSON(text, what) {
  let cleaned = String(text).trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new UserError(
      "ردّ النموذج (" + what + ") ليس JSON صالحًا أو جاء مقطوعًا. " +
      "قلّل نطاق الطلب أو ركّز على ملفات أقل ثم أعد المحاولة."
    );
  }
}

export async function askAI(env, messages, maxTokens, timeoutMs, label) {
  const model = cleanSecret(env.MODEL) || DEFAULT_MODEL;
  let result;

  try {
    result = await withTimeout(env.AI.run(model, {
      messages,
      max_tokens: maxTokens,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "low"
    }), timeoutMs, label);
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError("فشل استدعاء Cloudflare Workers AI (" + model + "): " +
      String((error && error.message) || error).slice(0, 600));
  }

  const candidates = [
    result?.response,
    result?.result?.response,
    result?.output_text,
    result?.choices?.[0]?.message?.content,
    result?.choices?.[0]?.text,
    result?.message?.content,
    result?.content
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (Array.isArray(candidate)) {
      const joined = candidate.map(part =>
        typeof part === "string" ? part :
        typeof part?.text === "string" ? part.text : ""
      ).join("");

      if (joined.trim()) return joined.trim();
    }

    if (candidate && typeof candidate === "object" &&
        typeof candidate.text === "string" && candidate.text.trim()) {
      return candidate.text.trim();
    }
  }

  const keys = result && typeof result === "object"
    ? Object.keys(result).join(", ")
    : typeof result;

  throw new UserError("نموذج Cloudflare AI لم يُرجع نصًا. النموذج: " + model +
    ". مفاتيح الاستجابة: " + (keys || "لا توجد") +
    ". تحقق من النموذج وربط AI وسجل أخطاء Worker.");
}
