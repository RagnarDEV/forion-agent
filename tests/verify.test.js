import test from "node:test";
import assert from "node:assert/strict";
import { extractMentionedPaths, fetchFailureLogs, waitForChecks } from "../src/pipeline/verify.js";
import { baseEnv, fakeAI, makeRepo } from "./helpers.js";

const env = baseEnv(fakeAI({}));
const FAST = { pollMs: 1, firstCheckMs: 20, timeoutMs: 2000, sleep: async () => {} };
const run = (id, status, conclusion, extra = {}) => ({ id, name: "Job " + id, status, conclusion, ...extra });

const wait = (repo, options = FAST) => waitForChecks(env, "o/r", "c2", options);

test("نجاح: كل الفحوصات مكتملة وناجحة (بعد استطلاعين متطابقين)", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [run(1, "completed", "success"), run(2, "completed", "skipped")];
    const result = await wait(repo);

    assert.equal(result.state, "success");
    assert.equal(result.failed.length, 0);
    assert.equal(repo.state.checkPolls, 2);
  } finally { repo.restore(); }
});

test("فشل: يُرجع الفحوصات الفاشلة", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [run(1, "completed", "success"), run(2, "completed", "failure")];
    const result = await wait(repo);

    assert.equal(result.state, "failure");
    assert.deepEqual(result.failed.map(item => item.id), [2]);
  } finally { repo.restore(); }
});

test("ينتظر الفحوصات الجارية ثم يعلن النتيجة", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = (sha, poll) => [run(1, poll < 2 ? "in_progress" : "completed", poll < 2 ? null : "success")];
    const result = await wait(repo);

    assert.equal(result.state, "success");
    assert.ok(repo.state.checkPolls >= 4);
  } finally { repo.restore(); }
});

test("بلا فحوصات: none بعد المهلة الأولى", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [];
    const result = await wait(repo, { ...FAST, firstCheckMs: 0 });

    assert.equal(result.state, "none");
  } finally { repo.restore(); }
});

test("فحوصات لا تنتهي: pending عند انتهاء المهلة", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [run(1, "in_progress", null)];
    const result = await wait(repo, { ...FAST, timeoutMs: 0 });

    assert.equal(result.state, "pending");
  } finally { repo.restore(); }
});

test("تعذر قراءة الفحوصات (صلاحية/404): unknown مع السبب", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Resource not accessible" }), { status: 403 });

  try {
    const result = await waitForChecks(env, "o/r", "c2", FAST);

    assert.equal(result.state, "unknown");
    assert.match(result.reason, /403/);
  } finally { globalThis.fetch = original; }
});

test("سجلات الفحص الفاشل: من Actions، أو من ملخص الفحص عند تعذرها", async () => {
  const repo = makeRepo({});
  try {
    repo.state.jobLogs["11"] = "2026-01-01T00:00:00.0000000Z \u001b[31mError: boom\u001b[0m in src/app.js";
    const failed = [
      run(11, "completed", "failure", { app: { slug: "github-actions" } }),
      run(12, "completed", "failure", { app: { slug: "other" }, output: { title: "Build failed", summary: "تفاصيل البناء" } })
    ];
    const text = await fetchFailureLogs(env, "o/r", failed);

    assert.match(text, /CHECK: Job 11 \(failure\)/);
    assert.match(text, /Error: boom in src\/app\.js/);
    assert.doesNotMatch(text, /\u001b/);
    assert.match(text, /Build failed/);
    assert.match(text, /تفاصيل البناء/);
  } finally { repo.restore(); }
});

test("استخراج مسارات الملفات المذكورة في السجل", () => {
  const known = new Map([["src/app.js", {}], ["src/lib/util.js", {}], ["README.md", {}]]);
  const log = "Error at /home/runner/work/r/r/src/app.js:3:1\n  at ./src/lib/util.js:9\n  at node_modules/x/index.js";

  assert.deepEqual(extractMentionedPaths(log, known), ["src/app.js", "src/lib/util.js"]);
  assert.deepEqual(extractMentionedPaths(log, known, new Set(["src/app.js"])), ["src/lib/util.js"]);
  assert.deepEqual(extractMentionedPaths(log, known, new Set(), 1), ["src/app.js"]);
  assert.deepEqual(extractMentionedPaths("لا ملفات هنا", known), []);
});
