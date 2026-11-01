import { parseModelJSON } from "../lib/ai.js";
import { CANDIDATE_IDS, modelInfo } from "./catalog.js";
import { callModel } from "./call-model.js";
import { ModelCallError } from "./errors.js";
import { neuronsFor } from "./usage.js";

// اختبار التوافق الحقيقي: يستدعي كل نموذج فعليًا عبر ربط AI في Worker الخاص بك (وليس نموذجًا وهميًا)،
// ويقيس: هل يقبل الاستدعاء؟ هل يقبل max_tokens؟ هل يُنتج JSON صحيحًا بما فيه الاقتباس والسطر الجديد والعربية؟
// تكلفته صغيرة (استدعاءان قصيران لكل نموذج) وتُحتسب من حصتك المجانية في الدفتر.
// نتيجته (ملف القدرات) تحدد أي النماذج يدخل في التوجيه: GPT-OSS لا يُستخدم قبل نجاح هذا الاختبار.

const PROBE_TIMEOUT_MS = 60000;
const PROBE_ESTIMATE = 60;     // حد أعلى تقريبي لتكلفة استدعاء الاختبار القصير (Neuron)
const EXPECTED_CODE = "const a = \"x\";\nreturn a;";

const BASIC = [
  { role: "system", content: "Return only a JSON object. No Markdown, no commentary." },
  { role: "user", content: "Return exactly this JSON and nothing else: {\"ok\":true,\"n\":7}" }
];

const STRICT = [
  { role: "system", content: "Return only a JSON object. No Markdown, no commentary." },
  {
    role: "user",
    content:
      "Return a JSON object with two keys. \"text\" must be exactly the Arabic word مرحبا. " +
      "\"code\" must be a JSON string whose decoded value is two lines: the first line is const a = \"x\"; " +
      "(it contains a double quote character) and the second line is return a; separated by a newline."
  }
];

const short = error => String((error && error.message) || error).replace(/\s+/g, " ").slice(0, 180);

async function attempt(env, info, messages, caps, ledger, totals) {
  if (ledger) {
    const denial = ledger.denial(PROBE_ESTIMATE);
    if (denial) throw new ModelCallError(denial, "quota", 3036);
  }

  const out = await callModel(env, info, { messages, maxTokens: 300, timeoutMs: PROBE_TIMEOUT_MS, label: "اختبار التوافق", caps });
  const neurons = neuronsFor(info, out.usage);

  totals.latency.push(out.latencyMs);
  if (neurons === null) totals.usageKnown = false;
  else totals.neurons += neurons;
  if (ledger) ledger.add(neurons === null ? PROBE_ESTIMATE : neurons, { approx: neurons === null });

  return out;
}

async function probeOne(env, id, ledger) {
  const info = modelInfo(id);
  const at = new Date().toISOString();
  const totals = { latency: [], neurons: 0, usageKnown: true };
  const result = { ok: false, jsonOk: false, acceptsMaxTokens: false, latencyMs: 0, neurons: 0, usageKnown: true, errors: [], at };

  // 1) استدعاء أساسي مع max_tokens.
  let basic = null;
  try {
    basic = await attempt(env, info, BASIC, { acceptsMaxTokens: true }, ledger, totals);
    result.acceptsMaxTokens = true;
  } catch (error) {
    if (error.kind === "quota") throw error;
    result.errors.push("مع max_tokens: " + short(error));
  }

  // 2) إن رفض النموذج max_tokens نجرّب بدونه (لا نمرّر ما لا يدعمه).
  if (!basic) {
    try {
      basic = await attempt(env, info, BASIC, null, ledger, totals);
    } catch (error) {
      if (error.kind === "quota") throw error;
      result.errors.push("بدون max_tokens: " + short(error));
    }
  }

  if (!basic) return finish(result, totals);

  result.ok = true;

  let basicJson = false;
  try {
    const parsed = parseModelJSON(basic.text, "الاختبار الأساسي");
    basicJson = parsed && parsed.ok === true && parsed.n === 7;
    if (!basicJson) result.errors.push("JSON الأساسي لا يطابق المتوقع.");
  } catch (error) {
    result.errors.push("JSON الأساسي: " + short(error));
  }

  // 3) JSON صارم: اقتباس وسطر جديد وعربية.
  let strictJson = false;
  try {
    const strict = await attempt(env, info, STRICT, result.acceptsMaxTokens ? { acceptsMaxTokens: true } : null, ledger, totals);
    const parsed = parseModelJSON(strict.text, "اختبار الترميز");
    strictJson = parsed && parsed.text === "مرحبا" && parsed.code === EXPECTED_CODE;
    if (!strictJson) result.errors.push("اختبار الترميز: القيم المفككة لا تطابق المتوقع (الاقتباس/السطر الجديد/العربية).");
  } catch (error) {
    if (error.kind === "quota") throw error;
    result.errors.push("اختبار الترميز: " + short(error));
  }

  result.jsonOk = basicJson && strictJson;
  return finish(result, totals);
}

function finish(result, totals) {
  const calls = totals.latency.length;

  result.latencyMs = calls ? Math.round(totals.latency.reduce((a, b) => a + b, 0) / calls) : 0;
  result.neurons = Math.round(totals.neurons * 10) / 10;
  result.usageKnown = totals.usageKnown;

  return result;
}

// يُرجع { at, models: { [id]: نتيجة }, stoppedByQuota }.
export async function probeModels(env, { ledger = null, ids = CANDIDATE_IDS } = {}) {
  const report = { at: new Date().toISOString(), models: {}, stoppedByQuota: false };

  for (const id of ids) {
    try {
      report.models[id] = await probeOne(env, id, ledger);
    } catch (error) {
      if (error.kind === "quota") {
        report.stoppedByQuota = true;
        report.message = error.message;
        break;
      }

      throw error;
    }
  }

  return report;
}
