import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../src/pipeline/index.js";
import { UserError } from "../src/lib/errors.js";
import { QuotaExhaustedError } from "../src/router/errors.js";
import { buildRouterContext } from "../src/router/input.js";
import { MAX_CALLS_PER_TASK, createRouter } from "../src/router/router.js";
import { baseEnv, makeIO, makeRepo } from "./helpers.js";
import {
  CAPACITY_ERROR, GEMMA, GLM, GPT_OSS, PROFILE_OK, QUOTA_ERROR, eventsOf, modelAI, reply, responsesReply
} from "./router-helpers.js";

// هذه اختبارات منطق بربط AI وهمي (محاكاة). الاختبار الحي للنماذج البديلة يتم من الإعدادات ← التوجيه.

const MESSAGES = [{ role: "system", content: "S" }, { role: "user", content: "hello world" }];
const MEDIUM_TASK = "add feature to src/a.js src/b.js src/c.js";
const HEAVY_TASK = "refactor src/a.js src/b.js src/c.js src/d.js src/e.js src/f.js " + "x ".repeat(1300);

function setup({ handler, env = {}, router = {}, task = "fix the bug in src/a.js" }) {
  const ai = modelAI(handler);
  const io = makeIO();
  const context = buildRouterContext(router);
  const instance = createRouter({ env: { AI: ai, ...env }, io, task, scan: null, ...context });

  return { ai, io, context, router: instance };
}

const call = (router, stage = "generate", extra = {}) =>
  router.ai.call({ stage, messages: MESSAGES, maxTokens: 1000, timeoutMs: 5000, label: "اختبار", ...extra });

test("Gemma يدخل Smart Auto فقط بعد نجاح JSON ومعامل الإخراج", async () => {
  const { ai, router } = setup({
    handler: ({ model }) => model === GLM ? (() => { throw new Error(CAPACITY_ERROR); })() : reply("{}"),
    router: { profile: { models: { [GEMMA]: { ok: true, jsonOk: true, outputLimitParam: "max_completion_tokens" } } } }
  });

  const answer = await call(router, "explore");
  assert.equal(answer.model, GEMMA);
  assert.deepEqual(ai.models(), [GLM, GEMMA]);
  assert.equal(ai.calls[1].request.max_completion_tokens, 1000);
  assert.equal("max_tokens" in ai.calls[1].request, false);
});

// ───────── الاختيار والمحاسبة ─────────

test("GLM يُستدعى بمعاملاته الحالية ويُحاسَب بأسعار الوثائق", async () => {
  const { ai, io, context, router } = setup({ handler: () => reply("{}", { prompt_tokens: 1000, completion_tokens: 100 }) });
  const answer = await call(router);

  assert.equal(answer.model, GLM);
  assert.equal(ai.calls[0].model, GLM);
  assert.equal(ai.calls[0].request.max_tokens, 1000);
  assert.deepEqual(ai.calls[0].request.chat_template_kwargs, { enable_thinking: false });
  assert.equal(ai.calls[0].request.reasoning_effort, "low");
  assert.ok(Math.abs(context.ledger.neurons - (5.5 + 3.64)) < 1e-6);

  const routes = eventsOf(io.events, "route");
  assert.equal(routes.length, 1);
  assert.equal(routes[0].label, "GLM-4.7-Flash");
  assert.equal(routes[0].stage, "generate");
  assert.ok(routes[0].reason.length > 0);
  assert.equal(eventsOf(io.events, "usage").length, 1);
});

test("مراحل مختلفة تستخدم نماذج مختلفة عند الفائدة (مهمة معقدة + GPT-OSS اجتاز الاختبار)", async () => {
  const { ai, router } = setup({ handler: () => reply("{}"), router: { profile: PROFILE_OK }, task: HEAVY_TASK });

  await call(router, "explore");
  await call(router, "repair");

  assert.deepEqual(ai.models(), [GLM, GPT_OSS]);

  // GPT-OSS لا يتلقى معاملات GLM، ويتلقى max_tokens لأن الاختبار أثبت قبوله.
  const request = ai.calls[1].request;
  assert.equal(request.max_tokens, 1000);
  for (const forbidden of ["chat_template_kwargs", "reasoning_effort", "reasoning", "response_format", "tools"]) {
    assert.equal(forbidden in request, false, forbidden);
  }

  const stages = router.summary().stages.map(item => item.stage + ":" + item.model);
  assert.deepEqual(stages, ["explore:" + GLM, "repair:" + GPT_OSS]);
});

test("استجابة Responses API من GPT-OSS تُستخرج وتُحاسَب بسعره", async () => {
  const { context, router } = setup({
    handler: ({ model }) => (model === GPT_OSS
      ? responsesReply({ ok: true }, { input_tokens: 1000, output_tokens: 100 })
      : reply("{}")),
    router: { profile: PROFILE_OK },
    task: HEAVY_TASK
  });

  const answer = await call(router, "repair");

  assert.equal(answer.model, GPT_OSS);
  assert.deepEqual(JSON.parse(answer.text), { ok: true });
  assert.ok(Math.abs(context.ledger.neurons - (18.182 + 2.7273)) < 1e-6);
});

// ───────── التبديل ─────────

test("نفاد السعة: ينتقل إلى النموذج الآخر بالسياق نفسه ويُبلَّغ المستخدم", async () => {
  const { ai, io, router } = setup({
    handler: ({ model }) => {
      if (model === GLM) throw new Error(CAPACITY_ERROR);
      return reply("{\"ok\":true}");
    },
    router: { profile: PROFILE_OK }
  });

  const answer = await call(router, "explore");

  assert.equal(answer.model, GPT_OSS);
  assert.deepEqual(ai.models(), [GLM, GPT_OSS]);
  assert.deepEqual(ai.calls[0].request.messages, ai.calls[1].request.messages);

  const routes = eventsOf(io.events, "route");
  assert.equal(routes.length, 2);
  assert.equal(routes[1].switched.from, GLM);
  assert.ok(eventsOf(io.events, "note").some(event => /تبديل النموذج/.test(event.message)));
});

test("المهلة تُحتسب تقريبيًا وتنتقل إلى النموذج الآخر", async () => {
  const { ai, context, router } = setup({
    handler: ({ model }) => (model === GLM ? new Promise(() => {}) : reply("{}")),
    router: { profile: PROFILE_OK }
  });

  const answer = await call(router, "explore", { timeoutMs: 20 });

  assert.equal(answer.model, GPT_OSS);
  assert.deepEqual(ai.models(), [GLM, GPT_OSS]);
  assert.equal(context.ledger.approx, true);
});

test("التبديل التلقائي معطّل: يفشل دون استدعاء ثانٍ", async () => {
  const { ai, router } = setup({
    handler: () => { throw new Error(CAPACITY_ERROR); },
    router: { profile: PROFILE_OK, settings: { fallback: false } }
  });

  await assert.rejects(() => call(router, "explore"), /3040/);
  assert.equal(ai.calls.length, 1);
});

test("لا نموذج بديل صالح (GPT-OSS غير مختبَر): يفشل بوضوح دون استدعاء ثانٍ", async () => {
  const { ai, io, router } = setup({ handler: () => { throw new Error(CAPACITY_ERROR); } });

  await assert.rejects(() => call(router, "explore"), UserError);
  assert.equal(ai.calls.length, 1);
  assert.ok(eventsOf(io.events, "note").some(event => /لم يُختبر/.test(event.message)));
});

test("فشل التنسيق بعد التحقق يخفّض النموذج ويُنتقل إلى الآخر في المحاولة التالية", async () => {
  const { ai, io, router } = setup({
    handler: ({ model }) => reply(model === GLM ? "not json" : "{\"ok\":true}"),
    router: { profile: PROFILE_OK },
    task: MEDIUM_TASK
  });

  const first = await call(router);
  assert.equal(first.model, GLM);
  router.ai.reject({ stage: "generate", model: first.model, kind: "format" });

  const second = await call(router);
  assert.equal(second.model, GPT_OSS);
  router.ai.accept({ stage: "generate", model: second.model });

  assert.deepEqual(ai.models(), [GLM, GPT_OSS]);

  const stats = eventsOf(io.events, "stat");
  assert.ok(stats.some(event => event.key.startsWith(GLM) && event.entry.fmt === 1 && event.entry.ok === 0));
  assert.ok(stats.some(event => event.key.startsWith(GPT_OSS) && event.entry.ok === 1));
});

test("نموذج يتطلب خطة مدفوعة يُستبعد لبقية المهمة ولا يُستخدم ثانيةً", async () => {
  const { ai, router } = setup({
    handler: ({ model, index }) => {
      if (index === 0) throw new Error(CAPACITY_ERROR);
      if (model === GPT_OSS) throw new Error("5035: This model requires a Workers Paid plan.");
      return reply("{}");
    },
    router: { profile: PROFILE_OK }
  });

  await assert.rejects(() => call(router, "explore"), /5035|مدفوعة|Paid/i);

  const later = await call(router, "select");
  assert.equal(later.model, GLM);
  assert.deepEqual(ai.models(), [GLM, GPT_OSS, GLM]);
});

// ───────── الحصة المجانية ─────────

test("نفاد الحصة (3036): يتوقف فورًا دون تبديل ودون أي استدعاء لاحق", async () => {
  const { ai, io, context, router } = setup({
    handler: () => { throw new Error(QUOTA_ERROR); },
    router: { profile: PROFILE_OK }
  });

  await assert.rejects(() => call(router, "explore"), error => error instanceof QuotaExhaustedError && /00:00/.test(error.message));
  assert.equal(context.ledger.exhausted, true);
  assert.equal(ai.calls.length, 1);

  await assert.rejects(() => call(router, "select"), QuotaExhaustedError);
  assert.equal(ai.calls.length, 1);
  assert.ok(eventsOf(io.events, "usage").some(event => event.ledger.exhausted === true));
});

test("دفتر نفد مسبقًا: لا استدعاء إطلاقًا", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { ai, router } = setup({
    handler: () => reply("{}"),
    router: { ledger: { day: today, neurons: 9000, exhausted: true } }
  });

  await assert.rejects(() => call(router), QuotaExhaustedError);
  assert.equal(ai.calls.length, 0);
});

test("الميزانية الداخلية الصغيرة تمنع الاستدعاء قبل حدوثه", async () => {
  const { ai, router } = setup({
    handler: () => reply("{}"),
    router: { settings: { dailyBudget: 500 } }
  });

  await assert.rejects(() => call(router, "generate", { maxTokens: 24000 }), QuotaExhaustedError);
  assert.equal(ai.calls.length, 0);
});

test("سقف استدعاءات المهمة", async () => {
  const { ai, router } = setup({ handler: () => reply("{}") });

  for (let i = 0; i < MAX_CALLS_PER_TASK; i++) await call(router, "explore");

  await assert.rejects(() => call(router, "explore"), /الحد الأقصى لاستدعاءات/);
  assert.equal(ai.calls.length, MAX_CALLS_PER_TASK);
});

// ───────── التثبيت التشخيصي ─────────

test("PIN_MODEL: نموذج ثابت بلا توجيه ولا تبديل", async () => {
  const { ai, io, router } = setup({
    handler: () => { throw new Error(CAPACITY_ERROR); },
    env: { PIN_MODEL: GPT_OSS },
    router: { profile: PROFILE_OK }
  });

  await assert.rejects(() => call(router, "explore"), /3040/);
  assert.deepEqual(ai.models(), [GPT_OSS]);
  assert.match(eventsOf(io.events, "route")[0].reason, /PIN_MODEL/);
});

// ───────── النجاح لا يُقاس بوصول الرد ─────────

test("لا تُسجَّل نتيجة نجاح قبل التحقق (accept)", async () => {
  const { io, router } = setup({ handler: () => reply("{}", { prompt_tokens: 100, completion_tokens: 10 }) });
  const answer = await call(router);

  assert.equal(eventsOf(io.events, "stat").length, 0);

  router.ai.accept({ stage: "generate", model: answer.model });
  const stat = eventsOf(io.events, "stat");
  assert.equal(stat.length, 1);
  assert.equal(stat[0].entry.ok, 1);
  assert.equal(stat[0].entry.nuse, 1);
  assert.ok(!JSON.stringify(stat[0]).includes("hello world"), "لا محتوى في الإحصاءات");
});

// ───────── خط المعالجة الكامل ─────────

const FILES = { "src/app.js": "export const a = 1;\n", "README.md": "# demo\n" };
const edit = (content, summary = "غيّرت") => reply({ summary, files: [{ path: "src/app.js", content }] });
const stagesOf = io => io.events.filter(event => event.type === "stage").map(event => event.stage);
const run = (ai, input = {}, env = {}, io = makeIO()) =>
  runPipeline(baseEnv(ai, env), { repo: "o/r", task: "غيّر القيمة", history: [], ...input }, io);

test("التبديل بين النماذج لا يكرر أي عملية GitHub والسياق ثابت", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = modelAI(({ model }) => {
      if (model === GLM) throw new Error(CAPACITY_ERROR);
      return edit("export const a = 2;\n");
    });
    const result = await run(ai, { router: { profile: PROFILE_OK } });
    const count = path => repo.calls.filter(item => item === "POST " + path).length;

    assert.equal(result.ok, true);
    assert.deepEqual(ai.models(), [GLM, GPT_OSS]);
    assert.deepEqual(ai.calls[0].request.messages, ai.calls[1].request.messages);

    for (const path of ["/repos/o/r/git/trees", "/repos/o/r/git/commits", "/repos/o/r/git/refs", "/repos/o/r/pulls"]) {
      assert.equal(count(path), 1, path);
    }

    const generate = result.router.stages.find(item => item.stage === "generate");
    assert.equal(generate.model, GPT_OSS);
    assert.equal(generate.switched.from, GLM);
  } finally { repo.restore(); }
});

test("استمرار وظائف GLM الحالية: كل المراحل GLM بمعاملاته، وفرع وPR كالمعتاد", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = modelAI(() => edit("export const a = 2;\n"));
    const io = makeIO();
    const result = await run(ai, {}, {}, io);

    assert.equal(result.ok, true);
    assert.equal(result.url, "https://github.com/o/r/pull/7");
    assert.ok(ai.models().every(model => model === GLM));
    assert.equal(ai.calls[0].request.max_tokens, 24000);
    assert.equal(ai.calls[0].request.reasoning_effort, "low");
    assert.deepEqual(stagesOf(io), ["scan", "select", "read", "generate", "publish"]);
    assert.equal(result.router.stages[0].model, GLM);
    assert.ok(result.router.taskNeurons >= 0);
  } finally { repo.restore(); }
});

test("نفاد الحصة أثناء التوليد: لا إعادة محاولة ولا فرع ولا PR", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = modelAI(() => { throw new Error(QUOTA_ERROR); });

    await assert.rejects(() => run(ai), QuotaExhaustedError);
    assert.equal(ai.calls.length, 1);
    assert.ok(!repo.calls.some(item => item.startsWith("POST")));
  } finally { repo.restore(); }
});

test("المراجعة (review): تُنفَّذ عند الطلب وتُدرج في وصف الـ PR", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = modelAI(({ index }) => (index === 0
      ? edit("export const a = 2;\n")
      : reply({ ok: true, blockers: [], notes: ["الكود متسق"] })));
    const io = makeIO();
    const result = await run(ai, { router: { settings: { review: "on" } } }, {}, io);

    assert.equal(ai.calls.length, 2);
    assert.ok(stagesOf(io).includes("review"));
    assert.equal(result.review.ok, true);
    assert.match(repo.state.prBody.body, /مراجعة آلية/);
    assert.match(repo.state.prBody.body, /الكود متسق/);
  } finally { repo.restore(); }
});

test("المراجعة تجد مشكلة مانعة: إعادة توليد واحدة فقط", async () => {
  const repo = makeRepo(FILES);
  try {
    const sequence = [
      edit("export const a = 2;\n"),
      reply({ ok: false, blockers: [{ path: "src/app.js", issue: "التصدير مفقود" }], notes: [] }),
      edit("export const a = 3;\n", "أصلحت")
    ];
    const ai = modelAI(({ index }) => sequence[index]);
    const result = await run(ai, { router: { settings: { review: "on" } } });

    assert.equal(ai.calls.length, 3);
    assert.equal(repo.state.treeBody.tree[0].content, "export const a = 3;\n");
    assert.equal(result.review.regenerated, true);
    assert.match(ai.calls[2].request.messages.at(-1).content, /REVIEWER FEEDBACK/);
  } finally { repo.restore(); }
});

test("المراجعة معطّلة افتراضيًا للمهام البسيطة (auto)", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = modelAI(() => edit("export const a = 2;\n"));
    const result = await run(ai);

    assert.equal(ai.calls.length, 1);
    assert.equal(result.review, undefined);
  } finally { repo.restore(); }
});
