import { DEFAULT_MODEL } from "../config.js";
import { UserError } from "./errors.js";
import { cleanSecret } from "./security.js";

export function withTimeout(promise, ms, label) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new UserError(
        "انتهت مهلة " + label + " (" + Math.round(ms / 1000) +
        " ثانية). قلّل نطاق الطلب أو حدّد الملفات المطلوبة بالاسم ثم أعد المحاولة."
      ));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * يحلل استجابة النموذج إلى كائن JSON.
 * يزيل أسوار Markdown الخارجية ويقتطع ما بين أول "{" وآخر "}" فقط.
 * لا يعدّل محتوى النصوص أبدًا: الشيفرة داخل القيم (HTML، أقواس < >، تعليقات) تبقى كما هي.
 */
export function parseModelJSON(text, what = "التوليد") {
  if (typeof text !== "string" || !text.trim()) {
    throw new UserError("استجابة النموذج (" + what + ") فارغة أو ليست نصًا صالحًا.");
  }

  let cleaned = text.trim();

  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) cleaned = fenced[1].trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new UserError(
      "استجابة النموذج (" + what + ") ليست JSON مكتملًا وصالحًا. " +
      "لم يتم نشر أي تغييرات. قلّل نطاق الطلب ثم أعد المحاولة."
    );
  }
}

// شكل Responses API (يستخدمه GPT-OSS على Workers AI): output = [{type:"reasoning"}, {type:"message", content:[{type:"output_text", text}]}]
// نأخذ نصوص رسالة الإجابة فقط ونتجاهل عناصر الاستدلال.
function fromResponsesOutput(output) {
  if (!Array.isArray(output)) return null;

  const parts = [];
  for (const item of output) {
    if (!item || item.type !== "message" || !Array.isArray(item.content)) continue;

    for (const piece of item.content) {
      if (piece && typeof piece.text === "string" && (!piece.type || piece.type === "output_text" || piece.type === "text")) {
        parts.push(piece.text);
      }
    }
  }

  const joined = parts.join("").trim();
  return joined || null;
}

/**
 * يستخرج النص من أشكال الاستجابة الشائعة في Workers AI (response / choices / output).
 * يُرجع null إن لم يجد نصًا بدل تمرير undefined إلى المراحل التالية.
 */
export function extractResponseText(result) {
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
      const joined = candidate
        .map(part => typeof part === "string" ? part :
          typeof part?.text === "string" ? part.text : "")
        .join("");

      if (joined.trim()) return joined.trim();
    }

    if (candidate && typeof candidate === "object" &&
        typeof candidate.text === "string" && candidate.text.trim()) {
      return candidate.text.trim();
    }
  }

  return fromResponsesOutput(result?.output) || fromResponsesOutput(result?.result?.output);
}

/**
 * يستدعي Cloudflare Workers AI بنموذج الخادم الأساسي (MODEL) ويعيد النص الناتج.
 * مسار قديم/مبسّط: التوجيه الذكي يستخدم router/call-model.js بمعاملات كل نموذج.
 * كل استدعاء يُحتسب من ميزانية الطلب (env.budget) إن وُجدت.
 */
export async function askAI(env, messages, maxTokens, timeoutMs, label) {
  const model = cleanSecret(env.MODEL) || DEFAULT_MODEL;

  if (!env.AI || typeof env.AI.run !== "function") {
    throw new UserError("خدمة Workers AI غير متاحة. تحقق من ربط AI في إعدادات Worker.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new UserError("تعذر إرسال الطلب إلى النموذج: قائمة الرسائل فارغة أو غير صالحة.");
  }

  if (env.budget) env.budget.spend();

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

    throw new UserError(
      "فشل استدعاء Cloudflare Workers AI (" + model + "): " +
      String(error?.message || error).slice(0, 500)
    );
  }

  const text = extractResponseText(result);

  if (text === null) {
    const keys = result && typeof result === "object"
      ? Object.keys(result).join(", ")
      : typeof result;

    throw new UserError(
      "لم يُرجع Workers AI نصًا صالحًا. النموذج: " + model +
      ". مفاتيح الاستجابة: " + (keys || "لا توجد") + "."
    );
  }

  return text;
}

// واجهة النموذج التي تستهلكها المراحل (explore/select/generate/review):
//   call({stage, messages, maxTokens, timeoutMs, label}) → { text, model }
//   accept({stage, model}) / reject({stage, model, kind})  ← تُبلَّغ بعد التحقق من صلاحية الناتج
// هذه النسخة تستخدم نموذج الخادم الأساسي دون توجيه؛ الموجّه الذكي يوفّر النسخة الكاملة.
export function legacyAI(env) {
  return {
    async call({ messages, maxTokens, timeoutMs, label }) {
      const text = await askAI(env, messages, maxTokens, timeoutMs, label);
      return { text, model: cleanSecret(env.MODEL) || DEFAULT_MODEL };
    },
    accept() {},
    reject() {}
  };
}
