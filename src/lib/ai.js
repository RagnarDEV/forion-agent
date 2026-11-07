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

const TEXT_PART_TYPES = new Set(["text", "output_text", "input_text", "text_delta"]);

const cleanText = value => typeof value === "string" && value.trim() ? value.trim() : null;

function fromContent(content) {
  const direct = cleanText(content);
  if (direct) return direct;

  if (Array.isArray(content)) {
    const parts = content.map(part => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object" || (part.type && !TEXT_PART_TYPES.has(part.type))) return "";
      return typeof part.text === "string" ? part.text : "";
    });
    return cleanText(parts.join(""));
  }

  if (content && typeof content === "object" && (!content.type || TEXT_PART_TYPES.has(content.type))) {
    return cleanText(content.text);
  }

  return null;
}

// Responses API: output = [{type:"reasoning"}, {type:"message", content:[{type:"output_text", text}]}].
// نأخذ أجزاء الرسالة النصية فقط ونحافظ على ترتيبها، ونتجاهل reasoning والبيانات الوصفية.
export function fromResponsesOutput(output) {
  if (!Array.isArray(output)) return null;

  const parts = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const text = item.type === "message"
      ? fromContent(item.content)
      : TEXT_PART_TYPES.has(item.type) ? cleanText(item.text) : null;
    if (text) parts.push(text);
  }

  return cleanText(parts.join(""));
}

/**
 * يستخرج النص من أشكال الاستجابة الشائعة في Workers AI (response / choices / output).
 * يُرجع null إن لم يجد نصًا بدل تمرير undefined إلى المراحل التالية.
 */
export function extractResponseText(result) {
  const seen = new WeakSet();

  const visit = value => {
    const direct = cleanText(value);
    if (direct) return direct;
    if (!value || typeof value !== "object") return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      const parts = value.map(item => visit(item) || "");
      return cleanText(parts.join(""));
    }

    const responseText = fromResponsesOutput(value.output);
    if (responseText) return responseText;

    if (Array.isArray(value.choices)) {
      for (const choice of value.choices) {
        const text = fromContent(choice && choice.message ? choice.message.content : null) ||
          fromContent(choice && choice.text);
        if (text) return text;
      }
    }

    for (const key of ["output_text", "response", "result", "message", "content", "text"]) {
      if (!(key in value)) continue;
      const text = key === "content" ? fromContent(value[key]) : visit(value[key]);
      if (text) return text;
    }

    return null;
  };

  return visit(result);
}

const typeOf = value => Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
const keysOf = value => value && typeof value === "object" && !Array.isArray(value)
  ? Object.keys(value).slice(0, 20).join(",") || "∅"
  : typeOf(value);

// تشخيص بنيوي محدود: أسماء مفاتيح وأنواع فقط، بلا محتوى أو أسرار.
export function describeResponseShape(result) {
  if (!result || typeof result !== "object") return "type=" + typeOf(result);

  const parts = ["type=" + typeOf(result), "keys=" + keysOf(result)];
  const add = (label, value) => parts.push(label + "=" + typeOf(value) + (value && typeof value === "object" && !Array.isArray(value) ? "{" + keysOf(value) + "}" : ""));

  add("response", result.response);
  add("result", result.result);
  add("choices", result.choices);
  if (Array.isArray(result.choices) && result.choices[0]) {
    add("choices[0]", result.choices[0]);
    add("choices[0].message", result.choices[0].message);
    add("choices[0].message.content", result.choices[0].message && result.choices[0].message.content);
    const content = result.choices[0].message && result.choices[0].message.content;
    if (Array.isArray(content)) parts.push("contentTypes=[" + content.map(item => typeOf(item) + (item && item.type ? ":" + item.type : "")).slice(0, 12).join(",") + "]");
  }
  add("output", result.output);
  add("output_text", result.output_text);
  return parts.join("; ");
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
    throw new UserError(
      "لم يُرجع Workers AI نصًا صالحًا. النموذج: " + model +
      ". بنية الاستجابة: " + describeResponseShape(result)
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
