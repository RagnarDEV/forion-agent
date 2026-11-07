import { h } from "./dom.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { apiPost } from "./api.js";
import { MODEL_STAGE_LABELS } from "./strings.js";
import {
  applyLedger, applyProfile, currentLedger, resetRouterStats, saveRouterSettings, saveRouterState
} from "./router-store.js";
import { toast } from "./toast.js";

// لوحة «التوجيه الذكي»: الوضع Smart Auto، حصة Neurons اليومية، اختبار التوافق الحقيقي، وإحصاءات الأداء.
// لا اختيار يدوي للنموذج: القرار آلي. التثبيت يأتي من إعدادات الخادم فقط (PIN_MODEL) للتشخيص.

let root = null;
let probing = false;

const REVIEW_LABELS = { off: "معطّلة", auto: "تلقائية (للمهام المعقدة فقط)", on: "دائمًا" };
const DAILY_CHOICES = [3000, 5000, 7000, 9000, 10000];
const TASK_CHOICES = [1000, 2000, 4000, 6000, 8000];

const settings = () => state.router.settings;
const catalog = () => state.router.catalog;

function persistSettings() {
  saveRouterSettings(settings());
}

function toggleRow(id, title, description, checked, onChange) {
  const input = h("input", { id, type: "checkbox", checked, onchange: event => onChange(event.target.checked) });

  return h("div", { class: "setting" },
    h("label", { class: "setting-text", for: id }, h("strong", { text: title }), h("span", { text: description })),
    h("span", { class: "switch" }, input, h("span", { class: "track", "aria-hidden": "true" }))
  );
}

function selectRow(id, title, description, values, current, format, onChange) {
  const select = h("select", { id, onchange: event => onChange(event.target.value) },
    values.map(value => h("option", { value, selected: String(current) === String(value) }, format(value)))
  );

  return h("div", { class: "setting" },
    h("label", { class: "setting-text", for: id }, h("strong", { text: title }), h("span", { text: description })),
    select
  );
}

const infoRow = (label, value) =>
  h("div", { class: "info-row" }, h("span", { text: label }), h("strong", { text: value }));

function usageCard() {
  const ledger = currentLedger();
  const budget = settings().dailyBudget;
  const used = Math.round(ledger.neurons);
  const pct = Math.min(100, Math.round((ledger.neurons / budget) * 100));

  const bar = h("div", { class: "meter-bar" });
  bar.style.width = pct + "%";

  const children = [
    h("h3", { text: "حصة اليوم (Neurons)" }),
    h("div", { class: "meter", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(budget), "aria-valuenow": String(used), "aria-label": "استهلاك اليوم" }, bar),
    infoRow("المستهلك اليوم (UTC)", used + " من " + budget),
    infoRow("الحصة المجانية الكاملة", ((catalog() && catalog().dailyFreeNeurons) || 10000) + " يوميًا، تتجدد 00:00 UTC")
  ];

  if (ledger.exhausted) {
    children.push(h("p", { class: "ai-note warn", text: "نفدت حصة اليوم: يتوقف الوكيل عن أي استدعاء للنماذج حتى منتصف الليل UTC. لا يُفعَّل أي شيء مدفوع." }));
  }
  if (ledger.approx) {
    children.push(h("p", { class: "ai-note", text: "يتضمن العداد حدودًا عليا لاستدعاءات لم تُرجع بيانات استخدام، فقد يزيد قليلًا عن الاستهلاك الفعلي." }));
  }

  children.push(
    h("p", { class: "field-hint", text: "العداد محلي ويحسب ما يستهلكه هذا الوكيل فقط. الحارس النهائي هو رفض Cloudflare عند نفاد الحصة (خطأ 3036)، وعندها يتوقف الوكيل فورًا." }),
    h("button", {
      type: "button",
      class: "btn btn-ghost small",
      onclick: () => {
        if (!window.confirm("إعادة ضبط العداد المحلي لليوم؟ هذا لا يغيّر الحصة الفعلية عند Cloudflare.")) return;
        state.router.ledger = { day: new Date().toISOString().slice(0, 10), neurons: 0, exhausted: false, approx: false };
        saveRouterState();
        draw();
      }
    }, icon("refresh"), h("span", { text: "إعادة ضبط العداد المحلي" }))
  );

  return h("div", { class: "info-card" }, children);
}

const profileOf = id => state.router.profile.models[id];

function modelStatus(id) {
  const profile = profileOf(id);
  if (id === (catalog() && catalog().baseline)) {
    return profile ? (profile.ok && profile.jsonOk ? "✓ الأساسي · اجتاز الاختبار" : "الأساسي · نتيجة الاختبار: " + (profile.ok ? "JSON غير صارم" : "فشل")) : "الأساسي (معتمد)";
  }
  if (!profile) return "غير مختبَر — لن يُستخدم";
  if (profile.ok && profile.jsonOk) {
    const param = profile.outputLimitParam || (profile.acceptsMaxTokens ? "max_tokens" : "none");
    return "✓ اجتاز الاختبار" + (param === "none" ? " · بلا معامل إخراج (لا يصلح للمخرجات الطويلة)" : " · يقبل " + param);
  }
  const requestOk = profile.requestOk === undefined ? profile.ok : profile.requestOk;
  const textExtracted = profile.textExtracted === undefined ? profile.ok : profile.textExtracted;
  if (!requestOk && !profile.ok) return "✗ فشل الاستدعاء";
  if (!textExtracted) return "✗ فشل استخراج النص";
  if (!profile.jsonOk) return "✗ JSON غير صارم";
  return "✗ فشل اختبار التوافق";
}

async function runProbe() {
  if (probing) return;

  probing = true;
  draw();

  try {
    const data = await apiPost("/api/router/probe", {
      router: { settings: settings(), ledger: currentLedger() }
    });

    applyProfile(data.report);
    applyLedger(data.ledger);

    if (data.report.stoppedByQuota) {
      toast("توقف الاختبار: " + (data.report.message || "نفدت الحصة."), "error", 6000);
    } else {
      toast("اكتمل اختبار التوافق الحقيقي.", "ok", 3000);
    }
  } catch (error) {
    toast(String((error && error.message) || error), "error", 6000);
  } finally {
    probing = false;
    draw();
  }
}

function modelsCard() {
  const models = (catalog() && catalog().models) || [];

  const rows = models.map(model => {
    const profile = profileOf(model.id);
    const lines = [
      h("div", { class: "info-row" },
        h("strong", { text: model.label }),
        h("span", { text: modelStatus(model.id) })
      ),
      h("p", { class: "field-hint", text: "السعر الرسمي: " + model.rates.inputPerM + " Neuron لكل مليون توكن مدخل، و" + model.rates.outputPerM + " للمخرج." })
    ];

    if (model.contextTokens) {
      const capabilities = model.capabilities
        ? [model.capabilities.functionCalling && "Function Calling", model.capabilities.reasoning && "Reasoning", model.capabilities.vision && "Vision"].filter(Boolean).join(" · ")
        : "";
      lines.push(h("p", { class: "field-hint", text: "السياق: " + model.contextTokens.toLocaleString("en-US") + " توكن" + (capabilities ? " · " + capabilities : "") }));
    }

    if (profile && profile.at) {
      lines.push(h("p", { class: "field-hint", text: "آخر اختبار: زمن ≈" + Math.round(profile.latencyMs) + "ms · استهلاك ≈" + Math.round(profile.neurons) + " Neuron" }));
    }
    if (profile && profile.errors && profile.errors.length) {
      lines.push(h("p", { class: "field-hint warn", text: profile.errors.join(" | ") }));
    }

    return h("div", { class: "model-row" }, lines);
  });

  return h("div", { class: "info-card" },
    h("h3", { text: "النماذج واختبار التوافق" }),
    rows,
    h("p", { class: "field-hint", text: "لا يدخل أي نموذج بديل في Smart Auto إلا بعد اختبار حقيقي على Worker الخاص بك: قبول الاستدعاء، معامل تحديد المخرجات الموثق عند الحاجة، وJSON صارم بالاقتباس والسطر الجديد والعربية. تكلفة الاختبار صغيرة وتُحتسب من حصتك المشتركة." }),
    h("button", {
      type: "button",
      class: "btn btn-primary small",
      disabled: probing,
      onclick: runProbe
    }, icon("zap"), h("span", { text: probing ? "جارٍ الاختبار…" : "اختبار التوافق الحقيقي الآن" }))
  );
}

function statsCard() {
  const entries = Object.entries(state.router.stats.entries).filter(([, entry]) => entry.n > 0);
  const labelOf = id => ((catalog() && catalog().models.find(model => model.id === id)) || { short: id.split("/").pop() }).short;

  const rows = entries
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 24)
    .map(([key, entry]) => {
      const [model, stage, cls] = key.split("|");
      const rate = Math.round((entry.ok / entry.n) * 100);
      const seconds = (entry.lat / entry.n / 1000).toFixed(1);
      const neurons = Math.round(entry.neu / entry.n);

      return infoRow(
        labelOf(model) + " · " + (MODEL_STAGE_LABELS[stage] || stage) + " · " + cls,
        "نجاح " + rate + "% (" + Math.round(entry.n) + ") · " + seconds + "ث · ≈" + neurons + "N" +
          (entry.fmt ? " · تنسيق " + Math.round(entry.fmt) : "") + (entry.to ? " · مهلة " + Math.round(entry.to) : "")
      );
    });

  return h("div", { class: "info-card" },
    h("h3", { text: "إحصاءات الأداء (محلية)" }),
    rows.length ? rows : h("p", { class: "sub empty", text: "لا بيانات بعد. تتراكم بعد كل مهمة، وتُستخدم عند اتخاذ القرار بعد 5 عينات على الأقل لكل حالة. النجاح يُقاس بعد التحقق من الناتج لا بوصول الرد." }),
    h("p", { class: "field-hint", text: "تحوي أعدادًا ومجاميع فقط: لا أسرار ولا نصوص ولا محتوى مستودعات ولا أسماء ملفات. السرعة لا تُعدّ دليل جودة." }),
    rows.length
      ? h("button", {
          type: "button",
          class: "btn btn-ghost small",
          onclick: () => {
            if (!window.confirm("مسح إحصاءات الأداء؟")) return;
            resetRouterStats();
            draw();
          }
        }, icon("trash"), h("span", { text: "مسح الإحصاءات" }))
      : null
  );
}

function draw() {
  if (!root) return;

  const pinned = catalog() && catalog().pinned;

  root.replaceChildren(
    h("p", { class: "sub", text: "Smart Auto: يحلل الوكيل مهمتك ويختار النموذج الأنسب لكل مرحلة (الاستكشاف، تحليل الملفات، التوليد، إصلاح CI، المراجعة)، وينتقل إلى النموذج الآخر عند الفشل ضمن حدود، ويتعلم من النتائج المتحقق منها. ضمن الحصة المجانية فقط." }),
    pinned
      ? h("p", { class: "ai-note warn", text: "الخادم يثبّت النموذج " + pinned + " (PIN_MODEL) لأغراض التشخيص: التوجيه والتبديل معطّلان حتى يُزال هذا المتغير." })
      : null,
    usageCard(),
    toggleRow("router-fallback", "التبديل التلقائي عند الفشل", "عند المهلة أو نفاد السعة أو JSON غير صالح قد ينتقل الوكيل إلى النموذج الآخر مرة واحدة لكل استدعاء (حتى 4 مرات للمهمة) بالسياق نفسه، دون تكرار أي عملية GitHub.", settings().fallback, value => {
      settings().fallback = value;
      persistSettings();
    }),
    selectRow("router-review", "مراجعة النتائج قبل النشر", "مرحلة مراجعة آلية استشارية؛ تُعاد المحاولة مرة واحدة فقط عند وجود مشكلة مانعة.", ["off", "auto", "on"], settings().review, value => REVIEW_LABELS[value], value => {
      settings().review = value;
      persistSettings();
    }),
    selectRow("router-daily", "الميزانية الداخلية اليومية (Neurons)", "سقف تضعه بنفسك أقل من الحصة المجانية (10,000) لترك هامش.", DAILY_CHOICES, settings().dailyBudget, value => value + (value === 9000 ? " (الافتراضي)" : ""), value => {
      settings().dailyBudget = Number(value);
      persistSettings();
      draw();
    }),
    selectRow("router-task", "سقف المهمة الواحدة (Neurons)", "تتوقف النماذج عن الاستدعاء إن كانت التكلفة المتوقعة تتجاوز المتبقي من هذا السقف.", TASK_CHOICES, settings().taskBudget, value => value + (value === 4000 ? " (الافتراضي)" : ""), value => {
      settings().taskBudget = Number(value);
      persistSettings();
    }),
    modelsCard(),
    statsCard()
  );
}

export function renderRouterPanel(container) {
  root = container;
  draw();
}
