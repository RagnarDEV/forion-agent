import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { capabilityGate } from "../src/router/policy.js";
import { sanitizeProfile } from "../src/router/input.js";
import { NeuronLedger } from "../src/router/ledger.js";
import { probeModels } from "../src/router/probe.js";
import { baseEnv } from "./helpers.js";
import { GEMMA, GLM, GPT_OSS, QUOTA_ERROR, modelAI, reply } from "./router-helpers.js";

// اختبارات منطق اختبار التوافق بربط AI وهمي (محاكاة). التنفيذ الحي الحقيقي على النماذج البديلة يتم من
// الإعدادات ← التوجيه ← «اختبار التوافق الحقيقي» على Worker المنشور، ولا يمكن تنفيذه من بيئة الاختبار.

const GOOD_STRICT = JSON.stringify({ text: "مرحبا", code: "const a = \"x\";\nreturn a;" });
const isStrict = request => request.messages[1].content.includes("مرحبا");
const good = (request, usage) => reply(isStrict(request) ? GOOD_STRICT : "{\"ok\":true,\"n\":7}", usage);
const today = () => new Date().toISOString().slice(0, 10);

test("الاختبار: GLM ينجح، وGPT-OSS يرفض max_tokens فيُختبر بدونه ولا يُمرَّر له ما لا يدعمه", async () => {
  const usage = { prompt_tokens: 50, completion_tokens: 20 };
  const ai = modelAI(({ model, request }) => {
    if (model === GPT_OSS && request.max_tokens !== undefined) throw new Error("unexpected parameter: max_tokens");
    return good(request, usage);
  });
  const ledger = new NeuronLedger({});
  const report = await probeModels({ AI: ai }, { ledger });

  assert.deepEqual(ai.models(), [GLM, GLM, GPT_OSS, GPT_OSS, GPT_OSS, GEMMA, GEMMA]);

  const glm = report.models[GLM];
  assert.equal(glm.ok, true);
  assert.equal(glm.jsonOk, true);
  assert.equal(glm.acceptsMaxTokens, true);
  assert.equal(glm.usageKnown, true);
  assert.ok(Math.abs(glm.neurons - 2) < 0.1, "neurons=" + glm.neurons);

  const oss = report.models[GPT_OSS];
  assert.equal(oss.ok, true);
  assert.equal(oss.jsonOk, true);
  assert.equal(oss.acceptsMaxTokens, false);
  assert.match(oss.errors[0], /max_tokens/);

  // الاستدعاء الأول لـ GPT-OSS أرسل max_tokens ورُفض؛ اللاحقان بلا max_tokens ولا أي معامل خاص بـ GLM.
  assert.equal(ai.calls[2].request.max_tokens, 300);
  for (const index of [3, 4]) {
    assert.equal("max_tokens" in ai.calls[index].request, false);
    assert.equal("chat_template_kwargs" in ai.calls[index].request, false);
    assert.equal("reasoning_effort" in ai.calls[index].request, false);
  }

  // الاختبار يُحاسَب من الحصة: GLM ≈2.0 + GPT-OSS ≈2.9 + Gemma ≈2.0.
  assert.ok(ledger.neurons > 6.5 && ledger.neurons < 7.5, "ledger=" + ledger.neurons);

  // النتيجة تُترجم إلى بوابات قدرة: لا يصلح للمخرجات الطويلة (generate) لكنه يصلح للاستكشاف.
  const profile = sanitizeProfile(report);
  assert.match(capabilityGate(GPT_OSS, "generate", profile), /max_tokens/);
  assert.equal(capabilityGate(GPT_OSS, "explore", profile), null);

  const gemma = report.models[GEMMA];
  assert.equal(gemma.ok, true);
  assert.equal(gemma.jsonOk, true);
  assert.equal(gemma.outputLimitParam, "max_completion_tokens");
  assert.equal(gemma.acceptsMaxTokens, false);
  assert.equal(ai.calls[5].request.max_completion_tokens, 300);
  assert.equal("max_tokens" in ai.calls[5].request, false);
  assert.equal(ai.calls[6].request.max_completion_tokens, 300);
});

test("Gemma ينتقل إلى max_tokens ثم بدونه إذا رفض المعاملات بالترتيب", async () => {
  const ai = modelAI(({ model, request }) => {
    if (model === GEMMA && request.max_completion_tokens !== undefined) throw new Error("unsupported max_completion_tokens");
    if (model === GEMMA && request.max_tokens !== undefined) throw new Error("unsupported max_tokens");
    return good(request);
  });
  const report = await probeModels({ AI: ai }, { ids: [GEMMA] });
  const gemma = report.models[GEMMA];

  assert.equal(gemma.ok, true);
  assert.equal(gemma.jsonOk, true);
  assert.equal(gemma.outputLimitParam, "none");
  assert.equal(gemma.acceptsMaxTokens, false);
  assert.deepEqual(ai.models(), [GEMMA, GEMMA, GEMMA, GEMMA]);
  assert.equal("max_completion_tokens" in ai.calls[0].request, true);
  assert.equal("max_tokens" in ai.calls[1].request, true);
  assert.equal("max_completion_tokens" in ai.calls[2].request, false);
  assert.equal("max_tokens" in ai.calls[2].request, false);
});

test("JSON غير صالح: يُسجَّل jsonOk=false ويُستبعد النموذج من التوجيه", async () => {
  const ai = modelAI(({ model, request }) => (model === GPT_OSS ? reply("not json") : good(request)));
  const report = await probeModels({ AI: ai }, {});
  const oss = report.models[GPT_OSS];

  assert.equal(oss.ok, true);
  assert.equal(oss.jsonOk, false);
  assert.ok(oss.errors.some(text => /JSON الأساسي/.test(text)));
  assert.equal(report.models[GLM].jsonOk, true);
  assert.match(capabilityGate(GPT_OSS, "explore", sanitizeProfile(report)), /JSON/);
});

test("ترميز خاطئ (فقدان الاقتباس/السطر الجديد): jsonOk=false", async () => {
  const wrong = JSON.stringify({ text: "مرحبا", code: "const a = x;" });
  const ai = modelAI(({ model, request }) => (model === GPT_OSS && isStrict(request) ? reply(wrong) : good(request)));
  const report = await probeModels({ AI: ai }, {});

  assert.equal(report.models[GPT_OSS].jsonOk, false);
  assert.ok(report.models[GPT_OSS].errors.some(text => /اختبار الترميز/.test(text)));
});

test("نفاد الحصة الحقيقي أثناء الاختبار: يتوقف ويُعلَّم الدفتر exhausted", async () => {
  const ai = modelAI(() => { throw new Error(QUOTA_ERROR); });
  const ledger = new NeuronLedger({});
  const report = await probeModels({ AI: ai }, { ledger });

  assert.equal(report.stoppedByQuota, true);
  assert.deepEqual(report.models, {});
  assert.equal(ai.calls.length, 1);
  assert.equal(ledger.exhausted, true);
});

test("ميزانيتك الداخلية لا تكفي: لا استدعاء، ولا يُعلَّم الدفتر بأنه نفد فعليًا", async () => {
  const ai = modelAI(({ request }) => good(request));
  const ledger = new NeuronLedger({ day: today(), neurons: 480 }, { dailyBudget: 500 });
  const report = await probeModels({ AI: ai }, { ledger });

  assert.equal(report.stoppedByQuota, true);
  assert.match(report.message, /ميزانية/);
  assert.equal(ai.calls.length, 0);
  assert.equal(ledger.exhausted, false);
});

// ───────── واجهات الخادم ─────────

const call = (path, { method = "GET", token = "admin-secret", body, env } = {}) =>
  worker.fetch(new Request("https://forion.test" + path, {
    method,
    headers: { ...(token ? { "X-Admin-Token": token } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }), env, { waitUntil() {} });

test("POST /api/router/probe: يتطلب مصادقة ويُرجع التقرير والدفتر", async () => {
  const ai = modelAI(({ request }) => good(request, { prompt_tokens: 50, completion_tokens: 20 }));
  const env = baseEnv(ai);

  assert.equal((await call("/api/router/probe", { method: "POST", token: "wrong", env })).status, 401);

  const response = await call("/api/router/probe", { method: "POST", env, body: {} });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(data.report.models).sort(), [GLM, GPT_OSS, GEMMA].sort());
  assert.equal(data.report.models[GLM].jsonOk, true);
  assert.ok(data.ledger.neurons > 0);
  assert.equal(data.ledger.exhausted, false);
});

test("POST /api/router/probe: يحترم الدفتر والميزانية القادمين من المتصفح", async () => {
  const ai = modelAI(({ request }) => good(request));
  const response = await call("/api/router/probe", {
    method: "POST",
    env: baseEnv(ai),
    body: { router: { settings: { dailyBudget: 500 }, ledger: { day: today(), neurons: 490 } } }
  });
  const data = await response.json();

  assert.equal(data.report.stoppedByQuota, true);
  assert.equal(ai.calls.length, 0);
});

test("GET /api/repos: يعرض كتالوج التوجيه (أسعار رسمية، بلا تثبيت افتراضي)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { full_name: "o/w", private: true, default_branch: "main", permissions: { push: true } }
  ]), { status: 200 });

  try {
    const plain = await (await call("/api/repos", { env: baseEnv(modelAI(() => reply("{}"))) })).json();

    assert.equal(plain.router.pinned, "");
    assert.equal(plain.router.baseline, GLM);
    assert.equal(plain.router.dailyFreeNeurons, 10000);
    assert.deepEqual(plain.router.models.map(model => model.id), [GLM, GPT_OSS, GEMMA]);
    assert.deepEqual(plain.router.models.find(model => model.id === GPT_OSS).rates, { inputPerM: 18182, outputPerM: 27273 });
    assert.deepEqual(plain.router.models.find(model => model.id === GEMMA).rates, { inputPerM: 9091, outputPerM: 27273 });

    const pinned = await (await call("/api/repos", { env: baseEnv(modelAI(() => reply("{}")), { PIN_MODEL: GPT_OSS }) })).json();
    assert.equal(pinned.router.pinned, GPT_OSS);
  } finally { globalThis.fetch = original; }
});
