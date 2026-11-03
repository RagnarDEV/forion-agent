import test from "node:test";
import assert from "node:assert/strict";
import { extractResponseText } from "../src/lib/ai.js";
import { MODEL_CATALOG, baselineModel, modelInfo, pinnedModel } from "../src/router/catalog.js";
import { classifyTask } from "../src/router/classify.js";
import { classifyAiError } from "../src/router/errors.js";
import { buildRouterContext, normalizeRouterSettings, sanitizeProfile } from "../src/router/input.js";
import { NeuronLedger } from "../src/router/ledger.js";
import { rankModels } from "../src/router/policy.js";
import { emptyStats, observedUsage, recordOutcome, sanitizeStats, statKey, wilsonLowerBound } from "../src/router/stats.js";
import { extractUsage, neuronsFor, upperBoundNeurons } from "../src/router/usage.js";
import { GLM, GPT_OSS, PROFILE_OK } from "./router-helpers.js";

const near = (actual, expected, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < epsilon, actual + " ≠ " + expected);

// ───────── الاستهلاك بأسعار الوثائق ─────────

test("extractUsage: شكلا chat وResponses، والمجهول", () => {
  assert.deepEqual(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 5 } }), { known: true, inputTokens: 10, outputTokens: 5 });
  assert.deepEqual(extractUsage({ usage: { input_tokens: 7, output_tokens: 3 } }), { known: true, inputTokens: 7, outputTokens: 3 });
  assert.equal(extractUsage({}).known, false);
  assert.equal(extractUsage({ usage: {} }).known, false);
  assert.equal(extractUsage(null).known, false);
});

test("neuronsFor: الأسعار الرسمية لكل مليون توكن", () => {
  near(neuronsFor(MODEL_CATALOG[GLM], { known: true, inputTokens: 1e6, outputTokens: 0 }), 5500);
  near(neuronsFor(MODEL_CATALOG[GLM], { known: true, inputTokens: 0, outputTokens: 1e6 }), 36400);
  near(neuronsFor(MODEL_CATALOG[GPT_OSS], { known: true, inputTokens: 1e6, outputTokens: 0 }), 18182);
  near(neuronsFor(MODEL_CATALOG[GPT_OSS], { known: true, inputTokens: 0, outputTokens: 1e6 }), 27273);
  assert.equal(neuronsFor(MODEL_CATALOG[GLM], { known: false }), null);
  assert.equal(neuronsFor(modelInfo("@cf/x/unknown"), { known: true, inputTokens: 1, outputTokens: 1 }), null);
});

test("GPT-OSS أغلى بنحو 3 أضعاف على المدخلات وأرخص قليلًا على المخرجات", () => {
  const input = { known: true, inputTokens: 1e6, outputTokens: 0 };
  const output = { known: true, inputTokens: 0, outputTokens: 1e6 };

  assert.ok(neuronsFor(MODEL_CATALOG[GPT_OSS], input) / neuronsFor(MODEL_CATALOG[GLM], input) > 3);
  assert.ok(neuronsFor(MODEL_CATALOG[GPT_OSS], output) < neuronsFor(MODEL_CATALOG[GLM], output));
});

test("upperBoundNeurons: حد أعلى رياضي من البايتات ولا يتجاوز max_tokens", () => {
  near(upperBoundNeurons(MODEL_CATALOG[GLM], { promptBytes: 1000, outputBytes: 50, maxTokens: 24000 }), (1000 / 1e6) * 5500 + (50 / 1e6) * 36400);
  near(upperBoundNeurons(MODEL_CATALOG[GLM], { promptBytes: 0, outputBytes: 1e9, maxTokens: 100 }), (100 / 1e6) * 36400);
});

// ───────── استخراج النص وتصنيف الأخطاء ─────────

test("extractResponseText: chat وResponses API (يتجاهل الاستدلال)", () => {
  assert.equal(extractResponseText({ response: "x" }), "x");
  assert.equal(extractResponseText({ choices: [{ message: { content: "hi" } }] }), "hi");
  assert.equal(
    extractResponseText({
      output: [
        { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking" }] },
        { type: "message", content: [{ type: "output_text", text: "{\"a\":1}" }] }
      ]
    }),
    "{\"a\":1}"
  );
  assert.equal(extractResponseText({}), null);
  assert.equal(extractResponseText({ output: [{ type: "reasoning", content: [] }] }), null);
});

test("classifyAiError: رموز Workers AI الموثقة", () => {
  assert.equal(classifyAiError(new Error("3036: You have used up your daily free allocation of 10,000 neurons")), "quota");
  assert.equal(classifyAiError(new Error("3040: Capacity temporarily exceeded")), "capacity");
  assert.equal(classifyAiError(new Error("3007: Request timeout")), "timeout");
  assert.equal(classifyAiError(new Error("5035: This model requires a Workers Paid plan")), "paid");
  assert.equal(classifyAiError(new Error("3006: Request is too large")), "toolarge");
  assert.equal(classifyAiError(new Error("5007: No such model")), "unavailable");
  assert.equal(classifyAiError(new Error("something else")), "error");
  assert.equal(classifyAiError({ kind: "capacity", message: "x" }), "capacity");
});

// ───────── الكتالوج ─────────

test("GLM يحتفظ بمعاملاته الحالية، وGPT-OSS لا يُمرَّر له ما لا يدعمه", () => {
  const messages = [{ role: "user", content: "x" }];

  assert.deepEqual(MODEL_CATALOG[GLM].buildInput({ messages, maxTokens: 5 }), {
    messages,
    max_tokens: 5,
    chat_template_kwargs: { enable_thinking: false },
    reasoning_effort: "low"
  });

  assert.deepEqual(MODEL_CATALOG[GPT_OSS].buildInput({ messages, maxTokens: 5 }), { messages });
  assert.deepEqual(MODEL_CATALOG[GPT_OSS].buildInput({ messages, maxTokens: 5, caps: { acceptsMaxTokens: true } }), { messages, max_tokens: 5 });

  for (const input of [
    MODEL_CATALOG[GPT_OSS].buildInput({ messages, maxTokens: 5, caps: { acceptsMaxTokens: true } }),
    MODEL_CATALOG[GPT_OSS].buildInput({ messages, maxTokens: 5 })
  ]) {
    for (const forbidden of ["reasoning", "reasoning_effort", "chat_template_kwargs", "response_format", "tools", "functions"]) {
      assert.equal(forbidden in input, false, forbidden);
    }
  }
});

test("النموذج الأساسي والمثبّت ونموذج مجهول", () => {
  assert.equal(baselineModel({ MODEL: "test-model" }), GLM);
  assert.equal(baselineModel({}), GLM);
  assert.equal(baselineModel({ MODEL: GPT_OSS }), GPT_OSS);
  assert.equal(pinnedModel({ PIN_MODEL: "  @cf/x/y " }), "@cf/x/y");
  assert.equal(pinnedModel({}), "");

  const generic = modelInfo("@cf/x/unknown");
  assert.equal(generic.unknown, true);
  assert.deepEqual(generic.buildInput({ messages: [], maxTokens: 9 }), { messages: [], max_tokens: 9 });
});

// ───────── الدفتر اليومي ─────────

const NOW = new Date("2026-11-03T10:00:00Z");

test("NeuronLedger: يحتفظ بنفس اليوم ويصفّر عند تغيّر يوم UTC", () => {
  const same = new NeuronLedger({ day: "2026-11-03", neurons: 100 }, { now: NOW });
  const next = new NeuronLedger({ day: "2026-11-02", neurons: 9999, exhausted: true }, { now: NOW });

  assert.equal(same.neurons, 100);
  assert.equal(next.neurons, 0);
  assert.equal(next.exhausted, false);
});

test("NeuronLedger: الميزانية الداخلية لا تتجاوز الحصة المجانية", () => {
  assert.equal(new NeuronLedger({}, { dailyBudget: 99999, now: NOW }).dailyBudget, 10000);
  assert.equal(new NeuronLedger({}, { dailyBudget: 10, now: NOW }).dailyBudget, 500);
});

test("NeuronLedger: أسباب الرفض (يومي، مهمة، نفاد)", () => {
  const daily = new NeuronLedger({}, { dailyBudget: 9000, taskBudget: 9000, now: NOW });
  daily.add(8900);
  assert.match(daily.denial(200), /اليومية/);
  assert.equal(daily.canAfford(50), true);

  const task = new NeuronLedger({}, { dailyBudget: 9000, taskBudget: 1000, now: NOW });
  task.add(900);
  assert.match(task.denial(200), /المهمة/);

  const done = new NeuronLedger({}, { now: NOW });
  done.markExhausted();
  assert.match(done.denial(1), /^نفدت/);
  assert.equal(done.toJSON().exhausted, true);
});

// ───────── الإحصاءات ─────────

test("sanitizeStats: يحذف المفاتيح غير الصالحة والحقول الغريبة (لا أسرار ولا محتوى)", () => {
  const key = statKey(GLM, "generate", "edit");
  const clean = sanitizeStats({
    entries: {
      [key]: { n: 5, ok: 3, secret: "ghp_token", path: "src/a.js", lat: 1e12 },
      "bad key": { n: 1 },
      "@cf/x/y|unknownstage|edit": { n: 1 }
    }
  });

  assert.deepEqual(Object.keys(clean.entries), [key]);
  assert.equal(clean.entries[key].secret, undefined);
  assert.equal(clean.entries[key].path, undefined);
  assert.ok(clean.entries[key].lat <= 1e9);
  assert.deepEqual(sanitizeStats(null), emptyStats());
});

test("recordOutcome: يسجل النتيجة، ويرفض المفاتيح والنتائج الباطلة، ويطبّق التناقص", () => {
  const stats = emptyStats();
  const key = statKey(GLM, "generate", "edit");

  recordOutcome(stats, { key, outcome: "ok", latencyMs: 1000, neurons: 5 });
  recordOutcome(stats, { key, outcome: "format", latencyMs: 500 });
  assert.equal(stats.entries[key].n, 2);
  assert.equal(stats.entries[key].ok, 1);
  assert.equal(stats.entries[key].fmt, 1);
  assert.equal(stats.entries[key].lat, 1500);

  assert.equal(recordOutcome(stats, { key, outcome: "nonsense" }), null);
  assert.equal(recordOutcome(stats, { key: "bad", outcome: "ok" }), null);

  for (let i = 0; i < 70; i++) recordOutcome(stats, { key, outcome: "ok" });
  assert.ok(stats.entries[key].n < 61, "n=" + stats.entries[key].n);
});

test("recordOutcome: سقف عدد المفاتيح", () => {
  const stats = emptyStats();

  for (let i = 0; i < 150; i++) {
    assert.ok(recordOutcome(stats, { key: statKey("@cf/m/" + i, "generate", "edit"), outcome: "ok" }));
  }

  assert.equal(recordOutcome(stats, { key: statKey("@cf/m/extra", "generate", "edit"), outcome: "ok" }), null);
});

test("wilsonLowerBound: لا يثق بعينات قليلة", () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
  assert.ok(wilsonLowerBound(20, 20) > wilsonLowerBound(5, 5));
  assert.ok(wilsonLowerBound(8, 10) < 0.8);
});

test("observedUsage: يحتاج 3 عينات استخدام فعلية على الأقل", () => {
  const stats = emptyStats();
  const key = statKey(GLM, "generate", "edit");
  const usage = { known: true, inputTokens: 500, outputTokens: 100 };

  recordOutcome(stats, { key, outcome: "ok", usage, promptChars: 1000 });
  recordOutcome(stats, { key, outcome: "ok", usage, promptChars: 1000 });
  assert.equal(observedUsage(stats, GLM), null);

  recordOutcome(stats, { key, outcome: "ok", usage, promptChars: 1000 });
  const observed = observedUsage(stats, GLM);
  near(observed.tokensPerChar, 0.5);
  near(observed.avgOutputTokens, 100);
});

// ───────── تحليل المهمة ─────────

test("classifyTask: النوع", () => {
  assert.equal(classifyTask({ task: "اشرح لي كيف يعمل المشروع" }).kind, "question");
  assert.equal(classifyTask({ task: "افحص الكود دون تغييرات" }).readOnly, true);
  assert.equal(classifyTask({ task: "fix the bug in src/a.js" }).kind, "bugfix");
  assert.equal(classifyTask({ task: "اصلح الخطأ في src/a.js" }).kind, "bugfix");
  assert.equal(classifyTask({ task: "add a new login feature" }).kind, "feature");
  assert.equal(classifyTask({ task: "update the README" }).kind, "docs");
  assert.equal(classifyTask({ task: "فحوصات CI فشلت" }).kind, "ci");
});

test("classifyTask: التعقيد وتقدير الملفات والاستدلال العميق", () => {
  const simple = classifyTask({ task: "fix the bug in src/a.js" });
  assert.equal(simple.complexity, "low");
  assert.equal(simple.deepReasoning, false);

  const files = ["src/a.js", "src/b.js", "src/c.js", "src/d.js", "src/e.js", "src/f.js"].join(" ");
  const heavy = classifyTask({ task: "refactor " + files + " " + "x ".repeat(1300) });
  assert.equal(heavy.complexity, "high");
  assert.equal(heavy.deepReasoning, true);
  assert.ok(heavy.filesEstimate >= 8);
  assert.equal(heavy.needsJson, true);
});

// ───────── سياسة الترتيب ─────────

const cls = (overrides = {}) => ({ kind: "edit", complexity: "low", deepReasoning: false, ...overrides });
const entry = (n, ok, latencyPerCall = 1000) => ({
  n, ok, fmt: n - ok, val: 0, to: 0, cap: 0, err: 0, lat: n * latencyPerCall, neu: 0, nuse: 0, tokIn: 0, charsIn: 0, tokOut: 0
});
const rank = (overrides = {}) => rankModels({
  stage: "generate",
  cls: cls(),
  candidates: [GLM, GPT_OSS],
  stats: emptyStats(),
  ledger: new NeuronLedger({}, { now: NOW }),
  failures: {},
  promptChars: 10000,
  maxTokens: 24000,
  profile: { models: {} },
  ...overrides
});

test("بدون اختبار توافق: GLM وحده، وGPT-OSS مستبعد بسبب واضح", () => {
  const rows = rank();

  assert.equal(rows[0].id, GLM);
  assert.match(rows.find(row => row.id === GPT_OSS).excluded, /لم يُختبر/);
});

test("GPT-OSS لا يصلح للمخرجات الطويلة قبل أن يثبت قبوله max_tokens", () => {
  const profile = { models: { [GPT_OSS]: { ok: true, jsonOk: true, acceptsMaxTokens: false } } };

  assert.match(rank({ profile }).find(row => row.id === GPT_OSS).excluded, /max_tokens/);
  assert.equal(rank({ profile, stage: "explore" }).find(row => row.id === GPT_OSS).excluded, null);
});

test("المهمة البسيطة: GLM، والمعقدة في الإصلاح: GPT-OSS (مراحل مختلفة بنماذج مختلفة)", () => {
  assert.equal(rank({ profile: PROFILE_OK })[0].id, GLM);
  assert.equal(rank({ profile: PROFILE_OK, stage: "repair", cls: cls({ complexity: "high", deepReasoning: true }) })[0].id, GPT_OSS);
  assert.equal(rank({ profile: PROFILE_OK, stage: "explore", cls: cls({ complexity: "high", deepReasoning: true }) })[0].id, GLM);
});

test("النتائج المقاسة تتفوق على الأولوية الأولية بعد عينات كافية", () => {
  const stats = emptyStats();
  stats.entries[statKey(GLM, "generate", "edit")] = entry(20, 8);
  stats.entries[statKey(GPT_OSS, "generate", "edit")] = entry(20, 20);

  const rows = rank({ profile: PROFILE_OK, stats });

  assert.equal(rows[0].id, GPT_OSS);
  assert.match(rows[0].why[0], /نجاح مقاس/);
});

test("عينات قليلة لا تغيّر القرار", () => {
  const stats = emptyStats();
  stats.entries[statKey(GPT_OSS, "generate", "edit")] = entry(3, 3);

  assert.equal(rank({ profile: PROFILE_OK, stats })[0].id, GLM);
});

test("السرعة وحدها لا تعني الجودة", () => {
  const stats = emptyStats();
  stats.entries[statKey(GLM, "generate", "edit")] = entry(20, 20, 20000);
  stats.entries[statKey(GPT_OSS, "generate", "edit")] = entry(20, 14, 500);

  assert.equal(rank({ profile: PROFILE_OK, stats })[0].id, GLM);
});

test("فشل سابق في المهمة يخفّض النموذج الفاشل", () => {
  const rows = rank({ profile: PROFILE_OK, cls: cls({ complexity: "medium" }), failures: { generate: { [GLM]: 1 } } });

  assert.equal(rows[0].id, GPT_OSS);
  assert.match(rows[0].why.join(" "), /فشل سابق|نموذج|بديل/);
});

test("الميزانية الصغيرة تستبعد المرشحين قبل أي استدعاء", () => {
  const rows = rank({ profile: PROFILE_OK, ledger: new NeuronLedger({}, { dailyBudget: 500, now: NOW }) });

  assert.ok(rows.every(row => row.excluded));
  assert.match(rows[0].excluded, /ميزانية|التكلفة/);
});

// ───────── مدخلات المتصفح ─────────

test("normalizeRouterSettings وsanitizeProfile وbuildRouterContext", () => {
  assert.deepEqual(normalizeRouterSettings(undefined), { fallback: true, review: "auto", dailyBudget: 9000, taskBudget: 4000 });
  assert.deepEqual(
    normalizeRouterSettings({ fallback: false, review: "on", dailyBudget: 99999, taskBudget: 5 }),
    { fallback: false, review: "on", dailyBudget: 10000, taskBudget: 200 }
  );
  assert.equal(normalizeRouterSettings({ review: "weird" }).review, "auto");

  const profile = sanitizeProfile({
    models: {
      [GPT_OSS]: { ok: true, jsonOk: "yes", acceptsMaxTokens: true, latencyMs: 5, secret: "x" },
      "@cf/evil/model": { ok: true }
    }
  });
  assert.deepEqual(Object.keys(profile.models), [GPT_OSS]);
  assert.equal(profile.models[GPT_OSS].jsonOk, false);
  assert.equal(profile.models[GPT_OSS].secret, undefined);

  const context = buildRouterContext({ ledger: { day: "2020-01-01", neurons: 9999, exhausted: true } }, NOW);
  assert.equal(context.ledger.neurons, 0);
  assert.equal(context.ledger.exhausted, false);
});
