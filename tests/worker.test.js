import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { baseEnv, fakeAI, makeRepo } from "./helpers.js";

const ctx = () => {
  const jobs = [];
  return { jobs, waitUntil: promise => jobs.push(promise) };
};

const call = (path, { method = "GET", token = "admin-secret", body, env } = {}) =>
  worker.fetch(new Request("https://forion.test" + path, {
    method,
    headers: { ...(token ? { "X-Admin-Token": token } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }), env || baseEnv(fakeAI({})), ctx());

test("المسارات غير API تُقدَّم من ASSETS، وتعطي 503 عند غيابه", async () => {
  const env = baseEnv(fakeAI({}), { ASSETS: { fetch: async () => new Response("<html>") } });

  assert.equal(await (await call("/", { env, token: "" })).text(), "<html>");
  assert.equal((await call("/", { token: "" })).status, 503);
});

test("المصادقة: رمز خاطئ 401، إعداد ناقص 503، مسار مجهول 404، طريقة غير مسموحة 405", async () => {
  assert.equal((await call("/api/repos", { token: "wrong" })).status, 401);
  assert.equal((await call("/api/repos", { token: "" })).status, 401);

  const missing = await call("/api/repos", { env: { AI: {}, ADMIN_TOKEN: "admin-secret" } });
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /GITHUB_TOKEN/);

  assert.equal((await call("/api/nothing")).status, 404);
  assert.equal((await call("/api/repos", { method: "DELETE" })).status, 405);
});

test("رمز الإدارة مع مسافات في السر المخزن يُقبل", async () => {
  const repo = makeRepo({});
  try {
    const env = baseEnv(fakeAI({}), { ADMIN_TOKEN: "  admin-secret\n" });
    const response = await call("/api/task", { method: "POST", body: { repo: "bad", task: "x" }, env });
    assert.equal(response.status, 400);
  } finally { repo.restore(); }
});

test("التحقق من مدخلات /api/task", async () => {
  const post = body => call("/api/task", { method: "POST", body });

  assert.equal((await post({ repo: "no-slash", task: "x" })).status, 400);
  assert.equal((await post({ repo: "o/r", task: "   " })).status, 400);
  assert.equal((await post({ repo: "o/r", task: "x".repeat(4001) })).status, 400);
});

test("/api/repos يُرجع المستودعات القابلة للكتابة والنموذج وحالة الدمج التلقائي", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { full_name: "o/w", private: true, default_branch: "main", permissions: { push: true } },
    { full_name: "o/ro", private: false, default_branch: "main", permissions: { push: false } }
  ]), { status: 200 });

  try {
    const response = await call("/api/repos", { env: baseEnv(fakeAI({}), { AUTO_MERGE: "true" }) });
    const data = await response.json();

    assert.deepEqual(data.repos.map(repo => repo.full_name), ["o/w"]);
    assert.equal(data.model, "test-model");
    assert.equal(data.autoMerge, true);
  } finally { globalThis.fetch = original; }
});

test("/api/task يبث NDJSON: مراحل ثم النتيجة", async () => {
  const repo = makeRepo({ "a.js": "export const a = 1;\n" });
  try {
    const ai = fakeAI({ summary: "تم", files: [{ path: "a.js", content: "export const a = 2;\n" }] });
    const jobs = ctx();
    const response = await worker.fetch(new Request("https://forion.test/api/task", {
      method: "POST",
      headers: { "X-Admin-Token": "admin-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "o/r", task: "غيّر القيمة", history: [] })
    }), baseEnv(ai), jobs);

    assert.match(response.headers.get("Content-Type"), /ndjson/);

    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    await Promise.all(jobs.jobs);

    assert.deepEqual(
      events.filter(event => event.type === "stage").map(event => event.stage),
      ["scan", "select", "read", "generate", "publish"]
    );
    const last = events[events.length - 1];
    assert.equal(last.type, "result");
    assert.equal(last.url, "https://github.com/o/r/pull/7");
  } finally { repo.restore(); }
});

test("/api/task يبث خطأً مفهومًا عند فشل المرحلة", async () => {
  const repo = makeRepo({ "a.js": "export const a = 1;\n" }, { push: false });
  try {
    const response = await worker.fetch(new Request("https://forion.test/api/task", {
      method: "POST",
      headers: { "X-Admin-Token": "admin-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "o/r", task: "x" })
    }), baseEnv(fakeAI({})), ctx());

    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    const last = events[events.length - 1];

    assert.equal(last.type, "error");
    assert.match(last.error, /صلاحية الكتابة/);
  } finally { repo.restore(); }
});
