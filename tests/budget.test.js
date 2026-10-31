import test from "node:test";
import assert from "node:assert/strict";
import { SubrequestBudget, budgetLimit, withBudget } from "../src/lib/budget.js";
import { github } from "../src/lib/github.js";
import { isRepairable, verifyAndRepair, waitForChecks } from "../src/pipeline/verify.js";
import { runPipeline } from "../src/pipeline/index.js";
import { UserError } from "../src/lib/errors.js";
import { LIMITS } from "../src/config.js";
import { baseEnv, fakeAI, makeIO, makeRepo } from "./helpers.js";

const FAST = { pollMs: 1, firstCheckMs: 20, timeoutMs: 2000, sleep: async () => {} };
const actions = (id, conclusion, status = "completed") =>
  ({ id, name: "Tests", status, conclusion, app: { slug: "github-actions" } });

test("SubrequestBudget: يعدّ ويحجز ويرمي UserError عند التجاوز", () => {
  const budget = new SubrequestBudget(5);

  budget.spend(2);
  assert.equal(budget.remaining, 3);
  assert.equal(budget.canAfford(3), true);
  assert.equal(budget.canAfford(3, 1), false);

  assert.throws(() => budget.spend(4), error => error instanceof UserError && /نفدت ميزانية/.test(error.message));
  assert.equal(budget.remaining, 3);
});

test("budgetLimit: الافتراضي 45 ويقبل SUBREQUEST_LIMIT المعقول فقط", () => {
  assert.equal(budgetLimit({}), LIMITS.subrequestLimit);
  assert.equal(budgetLimit({ SUBREQUEST_LIMIT: "900" }), 900);
  assert.equal(budgetLimit({ SUBREQUEST_LIMIT: "3" }), LIMITS.subrequestLimit);
  assert.equal(budgetLimit({ SUBREQUEST_LIMIT: "abc" }), LIMITS.subrequestLimit);
});

test("withBudget: نسخة لكل طلب ولا تعدّل env الأصلي", () => {
  const root = baseEnv(fakeAI({}));
  const scoped = withBudget(root);

  assert.ok(scoped.budget instanceof SubrequestBudget);
  assert.equal(root.budget, undefined);
  assert.notEqual(withBudget(root).budget, scoped.budget);
});

test("github(): كل استدعاء يُحتسب، والتجاوز يفشل قبل أي طلب شبكة", async () => {
  const repo = makeRepo({ "a.js": "x" });
  try {
    const env = { ...baseEnv(fakeAI({})), budget: new SubrequestBudget(2) };

    await github(env, "/repos/o/r");
    await github(env, "/repos/o/r");
    const before = repo.calls.length;

    await assert.rejects(() => github(env, "/repos/o/r"), error => error instanceof UserError && /نفدت ميزانية/.test(error.message));
    assert.equal(repo.calls.length, before);
  } finally { repo.restore(); }
});

test("isRepairable: Actions نعم، فحص خارجي بلا تفاصيل لا", () => {
  assert.equal(isRepairable({ app: { slug: "github-actions" } }), true);
  assert.equal(isRepairable({ app: { slug: "cloudflare-workers-and-pages" }, output: { title: "", summary: "" } }), false);
  assert.equal(isRepairable({ app: { slug: "x" } }), false);
  assert.equal(
    isRepairable({ app: { slug: "x" }, output: { title: "Build failed", summary: "error TS2304: Cannot find name foo in src/app.ts line 12" } }),
    true
  );
});

test("waitForChecks: ميزانية ضيقة تُنهي الانتظار بـ pending وسبب واضح", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [actions(1, null, "in_progress")];
    const env = { ...baseEnv(fakeAI({})), budget: new SubrequestBudget(3) };
    const result = await waitForChecks(env, "o/r", "c2", FAST);

    assert.equal(result.state, "pending");
    assert.match(result.reason, /حد الاستدعاءات/);
    assert.equal(repo.state.checkPolls, 1);
  } finally { repo.restore(); }
});

test("waitForChecks: عند ضيق الميزانية يكتفي باستطلاع واحد (بلا تأكيد مزدوج)", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [actions(1, "success")];
    const env = { ...baseEnv(fakeAI({})), budget: new SubrequestBudget(20) };
    const result = await waitForChecks(env, "o/r", "c2", FAST);

    assert.equal(result.state, "success");
    assert.equal(repo.state.checkPolls, 1);
  } finally { repo.restore(); }
});

const stubs = () => ({
  scan: { candidateMap: new Map() },
  published: { headSha: "c2", treeSha: "t2", branch: "forion-agent-x", number: 7 },
  changed: [{ path: "src/app.js", content: "export const a = 2;\n" }],
  existingPaths: ["src/app.js"],
  task: "غيّر القيمة",
  options: { repairRounds: 2, attempts: 1 },
  timing: FAST
});

test("فحص خارجي فاشل بلا سجل (مثل Workers Builds): لا إصلاح ولا استدعاء نموذج، مع رابط التفاصيل", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [{
      id: 5, name: "Workers Builds: forion-agent", status: "completed", conclusion: "failure",
      app: { slug: "cloudflare-workers-and-pages" }, html_url: "https://github.com/o/r/runs/5", output: { title: "", summary: "" }
    }];
    const ai = fakeAI({});
    const result = await verifyAndRepair(baseEnv(ai), { ...stubs(), io: makeIO() });

    assert.equal(result.ci.state, "failure");
    assert.equal(result.ci.rounds, 0);
    assert.match(result.ci.reason, /خارجي/);
    assert.deepEqual(result.ci.links, [{ name: "Workers Builds: forion-agent", url: "https://github.com/o/r/runs/5" }]);
    assert.equal(ai.requests.length, 0);
    assert.equal(repo.state.refPatches.length, 0);
  } finally { repo.restore(); }
});

test("الإصلاح الذاتي لا يبدأ إن لم تكفِ الميزانية", async () => {
  const repo = makeRepo({});
  try {
    repo.state.checkRuns = () => [actions(11, "failure")];
    const budget = new SubrequestBudget(30);
    budget.used = 25;
    const ai = fakeAI({});
    const result = await verifyAndRepair({ ...baseEnv(ai), budget }, { ...stubs(), io: makeIO() });

    assert.equal(result.ci.state, "failure");
    assert.equal(result.ci.rounds, 0);
    assert.match(result.ci.reason, /ميزانية/);
    assert.equal(ai.requests.length, 0);
  } finally { repo.restore(); }
});

test("خط المعالجة: لا يبدأ النشر دون رصيد كافٍ، ولا يُنشأ أي شيء", async () => {
  const repo = makeRepo({ "src/app.js": "export const a = 1;\n", "README.md": "# demo\n" });
  try {
    const ai = fakeAI({ summary: "x", files: [{ path: "src/app.js", content: "export const a = 2;\n" }] });

    await assert.rejects(
      () => runPipeline(baseEnv(ai, { SUBREQUEST_LIMIT: "10" }), { repo: "o/r", task: "غيّر", history: [] }, makeIO()),
      error => error instanceof UserError && /لا تكفي ميزانية/.test(error.message)
    );
    assert.ok(!repo.calls.some(call => call.startsWith("POST")));
  } finally { repo.restore(); }
});
