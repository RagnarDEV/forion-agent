import { UserError } from "../lib/errors.js";
import { extractResponseText } from "../lib/ai.js";
import { ModelCallError, classifyAiError } from "./errors.js";
import { extractUsage } from "./usage.js";

function race(promise, ms, label) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ModelCallError(
        "انتهت مهلة " + label + " (" + Math.round(ms / 1000) + " ثانية).",
        "timeout",
        3007
      ));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// استدعاء نموذج واحد بمعاملاته هو فقط، مع قياس الزمن واستخراج النص والاستخدام.
// لا يعيد المحاولة ولا يبدّل النموذج: القرار للموجّه. يُحتسب الاستدعاء من ميزانية الطلب (subrequests).
export async function callModel(env, info, { messages, maxTokens, timeoutMs, label, caps = null }) {
  if (!env.AI || typeof env.AI.run !== "function") {
    throw new UserError("خدمة Workers AI غير متاحة. تحقق من ربط AI في إعدادات Worker.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new UserError("تعذر إرسال الطلب إلى النموذج: قائمة الرسائل فارغة أو غير صالحة.");
  }

  if (env.budget) env.budget.spend();

  const started = Date.now();
  let result;

  try {
    result = await race(env.AI.run(info.id, info.buildInput({ messages, maxTokens, caps })), timeoutMs, label);
  } catch (error) {
    if (error instanceof ModelCallError) throw error;

    throw new ModelCallError(
      "فشل استدعاء Workers AI (" + info.label + "): " + String((error && error.message) || error).slice(0, 400),
      classifyAiError(error),
      error && error.code
    );
  }

  const text = extractResponseText(result);

  if (text === null) {
    const keys = result && typeof result === "object" ? Object.keys(result).join(", ") : typeof result;

    throw new ModelCallError(
      "لم يُرجع " + info.label + " نصًا صالحًا. مفاتيح الاستجابة: " + (keys || "لا توجد") + ".",
      "empty"
    );
  }

  return { text, usage: extractUsage(result), latencyMs: Date.now() - started };
}
