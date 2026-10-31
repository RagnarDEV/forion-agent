import { UserError } from "../lib/errors.js";

// أخطاء استدعاء النماذج مصنّفة بنوعها، ليقرر الموجّه: إعادة محاولة، تبديل، أو إيقاف.
//   quota       نفاد الحصة اليومية (الرمز 3036): لا فائدة من إعادة المحاولة أو التبديل (الحصة مشتركة بين النماذج)
//   capacity    نفاد السعة اللحظي (3040): عابر، يستحق التبديل أو إعادة المحاولة
//   timeout     انتهت المهلة (3007/3008 أو مهلتنا)
//   paid        النموذج يتطلب خطة مدفوعة (5035): لا يُستخدم أبدًا
//   unavailable لا يوجد النموذج (5007/3042)
//   toolarge    الطلب أكبر من المسموح (3006)
//   empty       استجابة بلا نص
//   error       غير ذلك
export class ModelCallError extends UserError {
  constructor(message, kind = "error", code = 0) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

export const QUOTA_MESSAGE =
  "نفدت حصة Workers AI المجانية اليومية (10,000 Neuron مشتركة بين كل النماذج) أو بلغت ميزانيتك الداخلية. " +
  "لن تُجرى استدعاءات إضافية، وتتجدد الحصة الساعة 00:00 بتوقيت UTC. لن يُفعَّل أي شيء مدفوع.";

export class QuotaExhaustedError extends ModelCallError {
  constructor(message = QUOTA_MESSAGE) {
    super(message, "quota", 3036);
  }
}

const CODES = /\b(3036|3040|3007|3008|3006|5035|5007|3042)\b/;

// يصنّف خطأ env.AI.run حسب رموز الأخطاء الموثقة في وثائق Workers AI (صفحة Errors).
export function classifyAiError(error) {
  if (error && typeof error.kind === "string") return error.kind;

  const text = String((error && error.message) || error || "");
  const match = text.match(CODES);
  const code = Number((error && error.code) || (match && match[1]) || 0);

  if (code === 3036 || /daily free allocation|used up your daily/i.test(text)) return "quota";
  if (code === 5035 || /requires a Workers Paid plan/i.test(text)) return "paid";
  if (code === 3040 || /out of capacity|No more data centers/i.test(text)) return "capacity";
  if (code === 3007 || code === 3008 || /time(d)? ?out/i.test(text)) return "timeout";
  if (code === 3006 || /request is too large/i.test(text)) return "toolarge";
  if (code === 5007 || code === 3042 || /no such model|invalid model/i.test(text)) return "unavailable";

  return "error";
}
