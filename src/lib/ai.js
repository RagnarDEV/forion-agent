
import { DEFAULT_MODEL } from "../config.js";
import { UserError } from "./errors.js";
import { cleanSecret } from "./security.js";

export function withTimeout(promise, ms, label) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new UserError(
          "انتهت مهلة " +
            label +
            " (" +
            Math.round(ms / 1000) +
            " ثانية). أعد المحاولة."
        )
      );
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * يحتوي على منطق الحافظة الذي يتطلب استعادة نص استجابة Workers AI المفككة (broken JSON).
 * يحاول تحويل أي جزء عشوائي من نص الاستجابة إلى JSON بشكل آمن دون محاولة استخراج جزء معين.
 */
function ensureBrokenJSONAwareness(
  prefixResults,
  fallbackResults,
  label
) {
  // البحث عن أي نتيجة ذاكرة أو تدفق تحتوي على كائن JSON مفكك.
  for (const { type, text } of [...prefixResults, ...fallbackResults]) {
    if (!text || typeof text !== "string") continue;

    // كائن JSON مفكك يبدأ بـ { أو [ أو رقم
    const brokenStart = text.trimStart().startsWith("{") ||
                      text.trimStart().startsWith("[") ||
                      text.trimStart() &&
                      /^(\d+|"[a-zA-Z]/.test(text.trimStart()[0]);

    if (brokenStart) {
      // تجنب استخدام نص طول 0
      const trimmed = text.trim();
      if (trimmed && trimmed.length > 10) {
        return {
          type: "json_fragment",
          text: trimmed
        };
      }
    }
  }

  return null;
}

/**
 * يستخرج النص من أشكال الاستجابة الشائعة في Workers AI.
 * يرفض القيم غير المعروفة بدل تمرير undefined إلى المراحل التالية.
 */
function extractResponseText(result) {
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
      const parts = candidate
        .map((part) => {
          if (typeof part === "string") return part;
          if (typeof part?.text === "string") return part.text;
          return "";
        })
        .join("");

      if (parts.trim()) {
        return parts.trim();
      }
    }

    if (
      candidate &&
      typeof candidate === "object" &&
      typeof candidate.text === "string" &&
      candidate.text.trim()
    ) {
      return candidate.text.trim();
    }
  }

  return null;
}

/**
 * يستدعي Cloudflare Workers AI ويعيد النص الناتج.
 */
export async function askAI(
  env,
  messages,
  maxTokens,
  timeoutMs,
  label
) {
  const model = cleanSecret(env.MODEL) || DEFAULT_MODEL;

  if (!env.AI || typeof env.AI.run !== "function") {
    throw new UserError(
      "خدمة Workers AI غير متاحة. تحقق من ربط AI في إعدادات Worker."
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new UserError(
      "تعذر إرسال الطلب إلى النموذج: قائمة الرسائل فارغة أو غير صالحة."
    );
  }

  let result;

  try {
    result = await withTimeout(
      env.AI.run(model, {
        messages,
        max_tokens: maxTokens,
        chat_template_kwargs: {
          enable_thinking: false
        },
        reasoning_effort: "low"
      }),
      timeoutMs,
      label
    );
  } catch (error) {
    if (error instanceof UserError) {
      throw error;
    }

    throw new UserError(
      "فشل استدعاء Cloudflare Workers AI (" +
        model +
        "): " +
        String(error?.message || error).slice(0, 500)
    );
  }

  const responseText = extractResponseText(result);

  if (responseText === null) {
    const keys =
      result && typeof result === "object"
        ? Object.keys(result).join(", ")
        : typeof result;

    throw new UserError(
      "لم يُرجع Workers AI نصًا صالحًا. النموذج: " +
        model +
        ". نوع الاستجابة: " +
        typeof result +
        ". مفاتيح الاستجابة: " +
        (keys || "لا توجد") +
        "."
    );
  }

  return responseText;
}
/**
 * يحلل JSON كاملًا فقط.
 * لا يحاول ترميم الرد المقطوع ولا استخراج جزء عشوائي منه.
 */
export function parseModelJSON(text, what = "التوليد") {
  if (typeof text !== "string" || !text.trim()) {
    throw new UserError(
      "استجابة النموذج (" + what + ") فارغة أو ليست نصًا صالحًا."
    );
  }

  let cleaned = text.trim();

  // السماح بكتلة Markdown إذا كان الرد كله داخل كتلة واحدة.
  const fenced = cleaned.match(
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i
  );

  if (fenced) {
    cleaned = fenced[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new UserError(
      "استجابة النموذج (" +
        what +
        ") ليست JSON مكتملًا وصالحًا. لم يتم نشر أي تغييرات. أعد المحاولة."
    );
  }
}
