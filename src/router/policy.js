import { GEMMA, GLM, GPT_OSS, modelInfo } from "./catalog.js";
import { measure, observedUsage, statKey } from "./stats.js";
import { estimateNeurons } from "./usage.js";

// سياسة اختيار النموذج لكل مرحلة. ثلاث طبقات:
//  1) بوابات القدرة: نموذج غير مختبَر أو لا يدعم ما تحتاجه المرحلة يُستبعد.
//  2) أولويات أولية معلنة (priors) قبل توفر بيانات مقاسة، مبنية على التكلفة الموثقة لا على ادعاءات جودة.
//  3) بيانات تاريخية مقاسة: نسبة نجاح بعد التحقق (حد ويلسون الأدنى) تتدرج لتحل محل الأولوية الأولية.
// السرعة لا تدخل في الجودة؛ تُستخدم فقط لكسر تعادل قريب.

export const MIN_SAMPLES = 5;
const FULL_WEIGHT_SAMPLES = 20;
const FAILURE_PENALTY = 25;
const TIE_MARGIN = 3;
const OUTPUT_HEAVY = new Set(["generate", "repair"]);
const REASONING_STAGES = new Set(["generate", "repair", "review"]);

// الأولوية الأولية: GLM أساس لأنه أرخص بنحو 3 أضعاف في المدخلات (الغالبة في مراحلنا) ومعتمد حاليًا.
// GPT-OSS أخفض قليلًا في المخرجات، فيُفضَّل في مراحل الاستدلال عند المهام العميقة.
function priorScore(modelId, stage, cls) {
  if (modelId === GLM) {
    return {
      score: cls.complexity === "low" ? 80 : 70,
      why: cls.complexity === "low" ? "مهمة بسيطة: الأرخص على المدخلات" : "الأساس الأرخص على المدخلات"
    };
  }

  if (modelId === GPT_OSS) {
    const base = stage === "repair" || stage === "review" ? 60 : stage === "generate" ? 55 : 50;

    if (cls.deepReasoning && REASONING_STAGES.has(stage)) {
      return { score: base + 15, why: "مهمة معقدة تحتاج استدلالًا أعمق" };
    }

    return { score: base, why: "بديل معتمد" };
  }

  if (modelId === GEMMA) {
    const base = stage === "repair" || stage === "review" ? 55 : stage === "generate" ? 52 : 50;

    if (cls.deepReasoning && REASONING_STAGES.has(stage)) {
      return { score: base + 5, why: "بديل Gemma بقدرات استدلال موثقة؛ الجودة تُقاس بالنتائج" };
    }

    return { score: base, why: "بديل Gemma معتمد بعد اختبار التوافق" };
  }

  return { score: 40, why: "نموذج غير معروف" };
}

// سبب استبعاد النموذج لهذه المرحلة، أو null إن كان صالحًا.
// GLM هو الأساس المعتمد حاليًا: لا يُستبعد بنتيجة اختبار (فشل عابر في الاختبار لا يجب أن يعطّل الوكيل).
export function capabilityGate(modelId, stage, profile) {
  if (modelId === GLM) return null;

  const caps = profile && profile.models ? profile.models[modelId] : null;

  if (!caps) return "لم يُختبر توافقه بعد (شغّل «اختبار التوافق» من الإعدادات)";
  if (caps.ok !== true || caps.jsonOk !== true) return "فشل اختبار التوافق أو إنتاج JSON";
  const outputLimitParam = caps.outputLimitParam || (caps.acceptsMaxTokens === true ? "max_tokens" : "none");
  if (OUTPUT_HEAVY.has(stage) && !["max_tokens", "max_completion_tokens"].includes(outputLimitParam)) {
    return "لم يثبت قبوله max_tokens أو max_completion_tokens، فلا يصلح للمخرجات الطويلة";
  }

  return null;
}

// يرتّب المرشحين. كل صف: { id, info, score, estimate, excluded, why[], measured }
export function rankModels({ stage, cls, candidates, stats, ledger, failures, promptChars, maxTokens, profile }) {
  const rows = candidates.map(id => {
    const info = modelInfo(id);
    const observed = observedUsage(stats, id);
    const estimate = estimateNeurons(info, { promptChars, maxTokens, observed });
    const gate = capabilityGate(id, stage, profile);
    const denial = gate ? null : ledger.denial(estimate);
    const prior = priorScore(id, stage, cls);
    const measured = measure(stats.entries[statKey(id, stage, cls.kind)]);
    const why = [prior.why];

    let score = prior.score;

    if (measured && measured.samples >= MIN_SAMPLES) {
      const weight = Math.min(1, measured.samples / FULL_WEIGHT_SAMPLES);

      score = score * (1 - weight) + measured.confidentRate * 100 * weight;
      why.unshift("نجاح مقاس " + Math.round(measured.successRate * 100) + "% من " + measured.samples + " محاولة");
    }

    // نخصم من النموذج الذي سيستهلك حصة كبيرة من المتبقي.
    const share = ledger.remaining > 0 ? estimate / ledger.remaining : 1;
    score -= Math.min(20, share * 40);

    const failed = (failures[stage] && failures[stage][id]) || 0;
    if (failed) {
      score -= FAILURE_PENALTY * failed;
      why.unshift("فشل سابق في هذه المهمة (" + failed + ")");
    }

    return { id, info, score, estimate, excluded: gate || denial, why, measured };
  });

  rows.sort((a, b) => {
    if (Boolean(a.excluded) !== Boolean(b.excluded)) return a.excluded ? 1 : -1;

    const diff = b.score - a.score;
    if (Math.abs(diff) >= TIE_MARGIN) return diff;

    // تعادل قريب: الأسرع المقاس ثم الأرخص (السرعة لا تعني الجودة، لذلك لا تتجاوز هامش التعادل).
    if (a.measured && b.measured && a.measured.avgLatencyMs !== b.measured.avgLatencyMs) {
      return a.measured.avgLatencyMs - b.measured.avgLatencyMs;
    }

    return a.estimate - b.estimate;
  });

  return rows;
}
