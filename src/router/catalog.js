import { DEFAULT_MODEL } from "../config.js";

// كتالوج النماذج. الأسعار من صفحة Pricing الرسمية لـ Workers AI (Neurons لكل مليون توكن).
// كل نموذج يبني مدخلاته بنفسه: لا تُمرَّر معاملات لا يدعمها (reasoning/chat_template...).

export const GLM = "@cf/zai-org/glm-4.7-flash";
export const GPT_OSS = "@cf/openai/gpt-oss-20b";
export const CANDIDATE_IDS = Object.freeze([GLM, GPT_OSS]);

export const MODEL_CATALOG = Object.freeze({
  [GLM]: Object.freeze({
    id: GLM,
    label: "GLM-4.7-Flash",
    short: "GLM",
    rates: Object.freeze({ inputPerM: 5500, outputPerM: 36400 }),
    contextTokens: 131072,
    // معاملات GLM التي يعتمد عليها الخط الحالي (تعطيل التفكير وجهد منخفض).
    buildInput: ({ messages, maxTokens }) => ({
      messages,
      max_tokens: maxTokens,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "low"
    })
  }),

  [GPT_OSS]: Object.freeze({
    id: GPT_OSS,
    label: "GPT-OSS-20B",
    short: "GPT-OSS",
    rates: Object.freeze({ inputPerM: 18182, outputPerM: 27273 }),
    contextTokens: 128000,
    // الوثائق تؤكد قبول messages فقط. max_tokens لا يُرسل إلا بعد أن يثبت اختبار التوافق قبوله.
    // ولا نرسل reasoning أو chat_template_kwargs أو response_format.
    buildInput: ({ messages, maxTokens, caps }) =>
      caps && caps.acceptsMaxTokens === true ? { messages, max_tokens: maxTokens } : { messages }
  })
});

// نموذج مثبّت من الخادم (PIN_MODEL) غير موجود في الكتالوج: نرسل له الحد الأدنى من المعاملات.
function genericModel(id) {
  const short = String(id).split("/").pop();

  return Object.freeze({
    id,
    label: short,
    short,
    rates: null,
    contextTokens: 32000,
    unknown: true,
    buildInput: ({ messages, maxTokens }) => ({ messages, max_tokens: maxTokens })
  });
}

export const modelInfo = id => MODEL_CATALOG[id] || genericModel(String(id));

const clean = value => (typeof value === "string" ? value.trim() : "");

// النموذج الأساسي: MODEL إن كان في الكتالوج، وإلا GLM الافتراضي.
export function baselineModel(env) {
  const configured = clean(env && env.MODEL);
  return MODEL_CATALOG[configured] ? configured : DEFAULT_MODEL;
}

// نموذج التشخيص الثابت (PIN_MODEL): يعطّل التوجيه والتبديل لأغراض التشخيص فقط.
export function pinnedModel(env) {
  return clean(env && env.PIN_MODEL);
}

// معلومات للواجهة (بلا أي أسرار).
export function publicCatalog(env) {
  return {
    baseline: baselineModel(env),
    pinned: pinnedModel(env),
    models: CANDIDATE_IDS.map(id => {
      const info = MODEL_CATALOG[id];
      return { id, label: info.label, short: info.short, rates: info.rates, contextTokens: info.contextTokens };
    })
  };
}
