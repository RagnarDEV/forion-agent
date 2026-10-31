// دفتر استهلاك Neurons اليومي (الحصة المجانية 10,000 Neuron يوميًا مشتركة بين كل النماذج وتتجدد 00:00 UTC).
// الدفتر يحتفظ به المتصفح ويُرسَل مع كل مهمة (لا تخزين خادم، ولا بيانات مستودعات).
// نحسب ما يستهلكه هذا الوكيل فقط؛ إن استهلك تطبيق آخر من الحساب نفسه فالخطأ 3036 هو الحارس الأخير.

export const DAILY_FREE_NEURONS = 10000;

export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export class NeuronLedger {
  constructor(raw = {}, { dailyBudget = 9000, taskBudget = 4000, now = new Date() } = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const sameDay = source.day === utcDay(now);

    // الميزانية الداخلية لا تتجاوز الحصة المجانية أبدًا.
    this.dailyBudget = clamp(dailyBudget, 500, DAILY_FREE_NEURONS, 9000);
    this.taskBudget = clamp(taskBudget, 200, DAILY_FREE_NEURONS, 4000);
    this.day = utcDay(now);
    this.neurons = sameDay ? clamp(source.neurons, 0, 1e7, 0) : 0;
    this.exhausted = sameDay && source.exhausted === true;
    this.approx = sameDay && source.approx === true;
    this.task = 0;
  }

  get remaining() {
    return Math.max(0, this.dailyBudget - this.neurons);
  }

  get taskRemaining() {
    return Math.max(0, this.taskBudget - this.task);
  }

  // سبب الرفض (نص عربي) أو null إن كان الاستدعاء مسموحًا.
  denial(estimate) {
    if (this.exhausted) return "نفدت الحصة اليومية لهذا اليوم (UTC).";
    if (this.neurons + estimate > this.dailyBudget) {
      return "التكلفة المتوقعة (≈" + Math.ceil(estimate) + " Neuron) تتجاوز المتبقي من ميزانيتك اليومية (" + Math.floor(this.remaining) + ").";
    }
    if (this.task + estimate > this.taskBudget) {
      return "التكلفة المتوقعة (≈" + Math.ceil(estimate) + " Neuron) تتجاوز المتبقي من ميزانية هذه المهمة (" + Math.floor(this.taskRemaining) + ").";
    }
    return null;
  }

  canAfford(estimate) {
    return this.denial(estimate) === null;
  }

  add(neurons, { approx = false } = {}) {
    const value = Math.max(0, Number(neurons) || 0);

    this.neurons += value;
    this.task += value;
    if (approx) this.approx = true;
  }

  markExhausted() {
    this.exhausted = true;
  }

  toJSON() {
    return {
      day: this.day,
      neurons: Math.round(this.neurons * 10) / 10,
      exhausted: this.exhausted,
      approx: this.approx
    };
  }
}
