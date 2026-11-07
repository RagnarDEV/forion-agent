// أدوات اختبار الموجّه: ربط AI وهمي يعرف اسم النموذج المستدعى (المحاكاة فقط، وليست اختبارًا حيًا).
// الاختبار الحي الحقيقي يُنفَّذ من الإعدادات ← التوجيه ← «اختبار التوافق الحقيقي» على Worker المنشور.

import { GEMMA, GLM, GPT_OSS } from "../src/router/catalog.js";

export { GEMMA, GLM, GPT_OSS };

export function modelAI(handler) {
  const calls = [];

  return {
    calls,
    models: () => calls.map(call => call.model),
    run: async (model, request) => {
      const index = calls.length;
      calls.push({
        model,
        request: {
          ...request,
          messages: Array.isArray(request.messages) ? request.messages.map(message => ({ ...message })) : request.messages
        }
      });
      return handler({ model, request, index, calls });
    }
  };
}

// استجابة بشكل chat مع usage اختياري.
export const reply = (value, usage) => ({
  response: typeof value === "string" ? value : JSON.stringify(value),
  ...(usage ? { usage } : {})
});

// استجابة بشكل Responses API (يستخدمه GPT-OSS): عنصر استدلال ثم رسالة الإجابة.
export const responsesReply = (value, usage) => ({
  output: [
    { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking..." }] },
    { type: "message", content: [{ type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value) }] }
  ],
  ...(usage ? { usage } : {})
});

// ملفات قدرات ناجحة للنماذج البديلة (تمثل نتيجة «اختبار التوافق» الناجحة).
export const PROFILE_OK = {
  models: { [GPT_OSS]: { ok: true, jsonOk: true, acceptsMaxTokens: true, latencyMs: 900, at: "2026-11-03T00:00:00Z" } }
};

export const PROFILE_GEMMA_OK = {
  models: {
    [GPT_OSS]: { ok: true, jsonOk: true, acceptsMaxTokens: true, outputLimitParam: "max_tokens", latencyMs: 900, at: "2026-11-03T00:00:00Z" },
    [GEMMA]: { ok: true, jsonOk: true, outputLimitParam: "max_completion_tokens", latencyMs: 850, at: "2026-11-03T00:00:00Z" }
  }
};

export const CAPACITY_ERROR = "3040: Capacity temporarily exceeded, please try again.";
export const QUOTA_ERROR = "3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.";

// حدث بحسب نوعه من مجموعة أحداث.
export const eventsOf = (events, type) => events.filter(event => event.type === type);
