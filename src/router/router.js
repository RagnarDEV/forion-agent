import { UserError } from "../lib/errors.js";
import { baselineModel, CANDIDATE_IDS, modelInfo, pinnedModel } from "./catalog.js";
import { callModel } from "./call-model.js";
import { classifyTask } from "./classify.js";
import { ModelCallError, QUOTA_MESSAGE, QuotaExhaustedError } from "./errors.js";
import { rankModels } from "./policy.js";
import { recordOutcome, statKey } from "./stats.js";
import { neuronsFor } from "./usage.js";

// الموجّه الذكي: يقرر لكل مرحلة أي نموذج يُستخدم، ومتى ينتقل إلى الآخر، ويتعلم من النتائج المتحقق منها.
// قواعد ثابتة:
//  - التبديل يغيّر النموذج فقط: نفس الرسائل ونفس السياق. أي عملية GitHub لا تُنفَّذ داخل الموجّه أبدًا،
//    فلا يمكن تكرارها بسبب التبديل.
//  - لا إعادة محاولة غير محدودة: حد لاستدعاءات المهمة وللتبديلات.
//  - فشل النموذج لا يخفف أي تحقق: ناتج غير صالح يُرفض كما هو بغض النظر عن النموذج.
//  - الحصة المجانية فقط: عند نفادها (3036 أو ميزانيتك الداخلية) تتوقف كل الاستدعاءات.

export const MAX_CALLS_PER_TASK = 40;
export const MAX_SWITCHES_PER_TASK = 4;
const MAX_SWITCHES_PER_CALL = 1;
const SWITCHABLE = new Set(["capacity", "timeout", "empty", "error", "paid", "unavailable"]);
const OUTCOME_OF_KIND = { capacity: "capacity", timeout: "timeout", empty: "format", toolarge: "error" };

const round = value => Math.round(value * 10) / 10;

export function createRouter({ env, io = null, task, scan = null, settings, ledger, stats, profile, deadline = 0 }) {
  const cls = classifyTask({ task, scan });
  const pinned = pinnedModel(env);
  const baseline = baselineModel(env);
  const order = pinned ? [pinned] : [baseline, ...CANDIDATE_IDS.filter(id => id !== baseline)];

  const failures = {};
  const pending = {};
  const routes = new Map();
  const unavailable = new Set();
  const warned = new Set();
  let calls = 0;
  let switches = 0;

  const emit = event => { if (io) io.emit(event); };
  const note = message => emit({ type: "note", message });
  const emitUsage = () => emit({ type: "usage", ledger: ledger.toJSON(), taskNeurons: round(ledger.task) });

  function record(stage, model, outcome, extra = {}) {
    const key = statKey(model, stage, cls.kind);
    const entry = recordOutcome(stats, { key, outcome, ...extra });

    if (entry) emit({ type: "stat", key, entry });
  }

  function candidatesNow(exclude) {
    return order.filter(id => !exclude.has(id) && !unavailable.has(id));
  }

  // فشل المهمة الحالية يخفّض أفضلية النموذج الفاشل فقط عندما يكون التبديل مسموحًا وضمن حده.
  const failureMemory = () =>
    settings.fallback && !pinned && switches < MAX_SWITCHES_PER_TASK ? failures : {};

  function rank(stage, exclude, promptChars, maxTokens) {
    return rankModels({
      stage,
      cls,
      candidates: candidatesNow(exclude),
      stats,
      ledger,
      failures: failureMemory(),
      promptChars,
      maxTokens,
      profile
    });
  }

  function reasonOf(choice) {
    if (pinned) return "نموذج ثابت من إعدادات الخادم (PIN_MODEL) لأغراض التشخيص";

    return choice.why.slice(0, 2).join(" · ");
  }

  function announce(stage, choice, rows) {
    const previous = routes.get(stage);
    const switched = previous && previous.model !== choice.id
      ? { from: previous.model, fromLabel: previous.label }
      : null;

    const route = {
      stage,
      model: choice.id,
      label: choice.info.label,
      reason: reasonOf(choice),
      estimate: Math.ceil(choice.estimate),
      switched
    };

    routes.set(stage, { ...route, calls: (previous ? previous.calls : 0) + 1 });

    if (!previous || switched) emit({ type: "route", ...route });

    if (switched) {
      switches++;
      note("تبديل النموذج في مرحلة «" + stage + "»: " + switched.fromLabel + " ← " + choice.info.label + " (" + route.reason + ").");
    }

    // نبلّغ مرة واحدة بسبب غياب النموذج البديل حتى لا يظن المستخدم أن التوجيه معطّل.
    for (const row of rows) {
      if (row !== choice && row.excluded && !warned.has(row.id) && !pinned) {
        warned.add(row.id);
        note(row.info.label + " غير مستخدم: " + row.excluded);
      }
    }
  }

  // لا نموذج صالح: إن كان السبب الميزانية/الحصة فهو إيقاف حصة، وإلا خطأ إعداد.
  function noModel(rows) {
    const reasons = rows.map(row => row.info.label + ": " + row.excluded).join(" | ");
    const budgetRelated = rows.length > 0 && rows.every(row => /الحصة|ميزانية|التكلفة/.test(row.excluded || ""));

    if (budgetRelated || ledger.exhausted) {
      return new QuotaExhaustedError("تعذر تنفيذ هذه المرحلة ضمن الحصة المجانية: " + reasons + ". " + QUOTA_MESSAGE);
    }

    return new UserError("لا يوجد نموذج صالح لهذه المرحلة. " + (reasons || "لا مرشحون."));
  }

  async function call({ stage, messages, maxTokens, timeoutMs, label }) {
    if (ledger.exhausted) throw new QuotaExhaustedError();
    if (deadline && Date.now() > deadline) throw new UserError("انتهى الوقت الكلي المسموح للمهمة.");

    const promptChars = messages.reduce((sum, message) => sum + String(message.content || "").length, 0);
    const exclude = new Set();

    for (let hop = 0; ; hop++) {
      if (calls >= MAX_CALLS_PER_TASK) {
        throw new UserError("بلغت المهمة الحد الأقصى لاستدعاءات النموذج (" + MAX_CALLS_PER_TASK + ").");
      }

      const rows = rank(stage, exclude, promptChars, maxTokens);
      const choice = rows.find(row => !row.excluded);
      if (!choice) throw noModel(rows);

      announce(stage, choice, rows);
      calls++;

      try {
        const out = await callModel(env, choice.info, {
          messages,
          maxTokens,
          timeoutMs,
          label,
          caps: profile && profile.models ? profile.models[choice.id] : null
        });

        // المحاسبة: usage الفعلي بأسعار الوثائق إن وُجد، وإلا الحد الأعلى المتحفّظ المعلَّم بـ approx.
        const actual = neuronsFor(choice.info, out.usage);
        ledger.add(actual === null ? choice.estimate : actual, { approx: actual === null });
        emitUsage();

        pending[stage] = {
          model: choice.id,
          latencyMs: out.latencyMs,
          neurons: actual === null ? choice.estimate : actual,
          usage: out.usage,
          promptChars
        };

        return { text: out.text, model: choice.id, usage: out.usage };
      } catch (error) {
        if (!(error instanceof ModelCallError)) throw error;

        const kind = error.kind;
        record(stage, choice.id, OUTCOME_OF_KIND[kind] || "error");

        if (kind === "quota") {
          ledger.markExhausted();
          emitUsage();
          throw new QuotaExhaustedError();
        }

        // مهلة منتهية: الطلب قد يكون استُهلك جزئيًا عند Cloudflare ولا نعرف قدره.
        if (kind === "timeout") {
          ledger.add(0, { approx: true });
          emitUsage();
        }

        if (kind === "paid" || kind === "unavailable") {
          unavailable.add(choice.id);
          note(choice.info.label + " غير متاح لهذا الحساب (" + kind + ") وسيُستبعد.");
        }

        const canSwitch = settings.fallback && !pinned && SWITCHABLE.has(kind) &&
          hop < MAX_SWITCHES_PER_CALL && switches < MAX_SWITCHES_PER_TASK;

        if (!canSwitch) throw error;

        exclude.add(choice.id);
        const alternatives = rank(stage, exclude, promptChars, maxTokens).filter(row => !row.excluded);

        if (!alternatives.length) {
          note("تعذر التبديل: لا يوجد نموذج بديل صالح ضمن الحصة المجانية.");
          throw error;
        }
      }
    }
  }

  // يُستدعى بعد التحقق من أن ناتج النموذج صالح فعلًا (وليس عند وصول الرد فقط).
  function accept({ stage, model }) {
    const info = pending[stage];
    if (!info || info.model !== model) return;

    record(stage, model, "ok", {
      latencyMs: info.latencyMs,
      neurons: info.neurons,
      usage: info.usage,
      promptChars: info.promptChars
    });
    delete pending[stage];
  }

  // kind: format (JSON/بنية) | validation (رُفض بقواعد التحقق). يؤثر على اختيار النموذج في المحاولة التالية.
  function reject({ stage, model, kind = "format" }) {
    const info = pending[stage] || {};

    record(stage, model, kind === "validation" ? "validation" : "format", {
      latencyMs: info.latencyMs || 0,
      neurons: info.neurons || 0,
      usage: info.usage || null,
      promptChars: info.promptChars || 0
    });

    failures[stage] = failures[stage] || {};
    failures[stage][model] = (failures[stage][model] || 0) + 1;
    delete pending[stage];
  }

  function shouldReview() {
    if (cls.readOnly || settings.review === "off") return false;
    if (settings.review === "on") return true;

    // auto: فقط للمهام المعقدة وحين تتسع الميزانية بوضوح.
    return cls.complexity === "high" &&
      ledger.remaining > ledger.dailyBudget * 0.5 &&
      ledger.taskRemaining > 1200;
  }

  function summary() {
    return {
      kind: cls.kind,
      complexity: cls.complexity,
      pinned: pinned || "",
      stages: [...routes.values()].map(route => ({
        stage: route.stage,
        model: route.model,
        label: route.label,
        reason: route.reason,
        calls: route.calls,
        switched: route.switched
      })),
      switches,
      calls,
      taskNeurons: round(ledger.task),
      ledger: ledger.toJSON()
    };
  }

  return {
    analysis: cls,
    ai: { call, accept, reject },
    shouldReview,
    summary,
    info: modelInfo
  };
}
