import { LIMITS } from "../config.js";
import { UserError } from "./errors.js";

// ميزانية الاستدعاءات الخارجية (subrequests) للطلب الواحد.
// Workers (الخطة المجانية) تفشل الطلب كله عند تجاوز الحد؛ فنعدّ كل استدعاء (GitHub والنموذج)
// ونتوقف بتحكم قبل الحد، ونحجز ما يلزم لمراحل لاحقة (النشر مثلًا).

export class SubrequestBudget {
  constructor(limit) {
    this.limit = limit;
    this.used = 0;
  }

  get remaining() {
    return Math.max(0, this.limit - this.used);
  }

  // يعدّ استدعاءً أو أكثر، ويرمي UserError مفهومًا قبل أن يتجاوز Workers الحد فعليًا.
  spend(count = 1) {
    if (this.used + count > this.limit) {
      throw new UserError(
        "نفدت ميزانية الاستدعاءات الخارجية لهذا الطلب (" + this.limit + "). " +
        "الخطة المجانية في Cloudflare تسمح بـ 50 استدعاءً لكل طلب. " +
        "قلّل نطاق المهمة، أو عطّل الاستكشاف الذكي أو فحص CI من الإعدادات."
      );
    }

    this.used += count;
  }

  // هل يتسع الرصيد لـ count استدعاءً مع إبقاء reserve لما بعده؟
  canAfford(count, reserve = 0) {
    return this.remaining - reserve >= count;
  }
}

export function budgetLimit(env) {
  const configured = Number(env && env.SUBREQUEST_LIMIT);
  return Number.isFinite(configured) && configured >= 10
    ? Math.floor(configured)
    : LIMITS.subrequestLimit;
}

// نسخة سطحية من env بميزانية خاصة بالطلب (env نفسه مشترك بين الطلبات فلا نعدّله).
export function withBudget(env) {
  return { ...env, budget: new SubrequestBudget(budgetLimit(env)) };
}
