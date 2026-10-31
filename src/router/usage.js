// قياس الاستهلاك. نعتمد على بيانات usage التي يُرجعها النموذج فعليًا، ولا نخمّن:
//  - عند توفر usage: neurons = (مدخل × سعر المدخل + مخرج × سعر المخرج) / مليون، بأسعار الوثائق الرسمية.
//  - عند غيابه: نحسب حدًا أعلى تحفظيًا (توكن لكل حرف للمدخل، وmax_tokens للمخرج) ونعلّمه "approx".

const number = value => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

// يدعم شكلي الاستخدام: chat (prompt/completion_tokens) وResponses (input/output_tokens).
export function extractUsage(result) {
  const usage = result && typeof result === "object" ? result.usage || (result.result && result.result.usage) : null;

  if (!usage || typeof usage !== "object") {
    return { known: false, inputTokens: 0, outputTokens: 0 };
  }

  const input = number(usage.prompt_tokens ?? usage.input_tokens);
  const output = number(usage.completion_tokens ?? usage.output_tokens);

  if (input === null && output === null) {
    return { known: false, inputTokens: 0, outputTokens: 0 };
  }

  return { known: true, inputTokens: input ?? 0, outputTokens: output ?? 0 };
}

// Neurons الفعلية من usage المعروف؛ null إن تعذّر (نموذج بلا أسعار أو usage مجهول).
export function neuronsFor(info, usage) {
  if (!info || !info.rates || !usage || !usage.known) return null;

  return (usage.inputTokens / 1e6) * info.rates.inputPerM +
         (usage.outputTokens / 1e6) * info.rates.outputPerM;
}

// نسبة التوكنات للأحرف ومتوسط المخرجات كما قيست فعليًا (من إحصاءات الاستخدام الحقيقية). null قبل توفر عينات كافية.
export function observedRatios(entries) {
  let tokIn = 0, charsIn = 0, tokOut = 0, nuse = 0;

  for (const entry of entries) {
    tokIn += entry.tokIn;
    charsIn += entry.charsIn;
    tokOut += entry.tokOut;
    nuse += entry.nuse;
  }

  if (nuse < 3 || charsIn <= 0) return null;

  return { tokensPerChar: tokIn / charsIn, avgOutputTokens: tokOut / nuse, samples: nuse };
}

// حد أعلى لتكلفة استدعاء قبل تنفيذه (للتحقق من الميزانية). يستخدم النسب المقيسة إن وُجدت.
export function estimateNeurons(info, { promptChars, maxTokens, observed = null }) {
  if (!info || !info.rates) return 0;

  const inputTokens = promptChars * (observed ? Math.min(1, observed.tokensPerChar * 1.25) : 1);
  const outputTokens = observed
    ? Math.min(maxTokens, Math.max(200, observed.avgOutputTokens * 1.5))
    : maxTokens;

  return (inputTokens / 1e6) * info.rates.inputPerM + (outputTokens / 1e6) * info.rates.outputPerM;
}
