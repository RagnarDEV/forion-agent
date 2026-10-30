import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../src/pipeline/index.js";
import { UserError } from "../src/lib/errors.js";
import { baseEnv, fakeAI, lastUserMessage, makeIO, makeRepo } from "./helpers.js";

const FILES = { "src/app.js": "export const a = 1;\n", "README.md": "# demo\n" };
const FAST = { pollMs: 1, firstCheckMs: 20, timeoutMs: 2000, sleep: async () => {} };
const run = (ai, input = {}, env = {}, io = makeIO()) =>
  runPipeline(baseEnv(ai, env), { repo: "o/r", task: "غيّر القيمة", history: [], ...input }, io);
const edit = (content, summary = "غيّرت") =>
  ({ summary, files: [{ path: "src/app.js", content }] });
const check = (id, conclusion, name = "Tests") =>
  ({ id, name, status: "completed", conclusion, app: { slug: "github-actions" } });

test("تدفق كامل: تعديل ملف ثم فرع وPull Request", async () => {
  const repo = makeRepo(FILES);
  try {
    const io = makeIO();
    const result = await run(fakeAI(edit("export const a = 2;\n")), {}, {}, io);

    assert.equal(result.ok, true);
    assert.equal(result.noChanges, false);
    assert.deepEqual(result.files, ["src/app.js"]);
    assert.equal(result.url, "https://github.com/o/r/pull/7");
    assert.equal(repo.state.treeBody.base_tree, "t1");
    assert.equal(repo.state.treeBody.tree[0].path, "src/app.js");
    assert.equal(repo.state.treeBody.tree[0].content, "export const a = 2;\n");
    assert.equal(repo.state.prBody.base, "main");
    assert.deepEqual(io.events.map(event => event.stage), ["scan", "select", "read", "generate", "publish"]);
  } finally { repo.restore(); }
});

test("الدمج التلقائي يُطلب فقط عند AUTO_MERGE=true", async () => {
  const repo = makeRepo(FILES);
  try {
    const result = await run(fakeAI(edit("export const a = 2;\n")), {}, { AUTO_MERGE: "true" });

    assert.equal(result.autoMerge.enabled, true);
    assert.ok(repo.state.graphql);
  } finally { repo.restore(); }

  const plain = makeRepo(FILES);
  try {
    const result = await run(fakeAI(edit("export const a = 2;\n")));

    assert.equal(result.autoMerge.enabled, false);
    assert.equal(plain.state.graphql, null);
  } finally { plain.restore(); }
});

test("طلب تحليلي: لا فرع ولا PR", async () => {
  const repo = makeRepo(FILES);
  try {
    const result = await run(fakeAI({ summary: "شرح المشروع", files: [] }), { task: "اشرح المشروع" });

    assert.equal(result.noChanges, true);
    assert.equal(result.summary, "شرح المشروع");
    assert.ok(!repo.calls.some(call => call.startsWith("POST")));
  } finally { repo.restore(); }
});

test("إنشاء ملف جديد في مستودع كبير دون اختيار أي ملف موجود", async () => {
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["src/f" + i + ".js", "export const v" + i + " = 1;\n"]));
  const repo = makeRepo(many);
  try {
    const ai = fakeAI({ paths: [] }, { summary: "أنشأت", files: [{ path: "docs/NOTES.md", content: "# ملاحظات\n" }] });
    const result = await run(ai, { task: "أضف توثيقًا" });

    assert.deepEqual(result.files, ["docs/NOTES.md"]);
    assert.equal(repo.state.treeBody.tree[0].path, "docs/NOTES.md");
  } finally { repo.restore(); }
});

test("مستودع بلا ملفات نصية: الإنشاء مسموح افتراضيًا ومرفوض عند تعطيله", async () => {
  const repo = makeRepo({ "logo.png": "binary" });
  try {
    const created = await run(
      fakeAI({ summary: "أنشأت", files: [{ path: "README.md", content: "# جديد\n" }] }),
      { task: "أنشئ README" }
    );
    assert.deepEqual(created.files, ["README.md"]);

    await assert.rejects(
      () => run(fakeAI({}), { task: "عدّل الكود", options: { allowCreate: false } }),
      UserError
    );
  } finally { repo.restore(); }
});

test("حذف ملف ونقل آخر في Pull Request واحد", async () => {
  const repo = makeRepo({ ...FILES, "docs/old.md": "old\n" });
  try {
    const ai = fakeAI({
      summary: "رتّبت",
      files: [],
      deletes: ["docs/old.md"],
      renames: [{ from: "src/app.js", to: "src/main.js" }]
    });
    const result = await run(ai, { task: "رتّب الملفات" });
    const tree = repo.state.treeBody.tree;

    assert.deepEqual(result.deleted, ["docs/old.md"]);
    assert.deepEqual(result.renamed, [{ from: "src/app.js", to: "src/main.js" }]);
    assert.equal(tree.find(entry => entry.path === "docs/old.md").sha, null);
    assert.equal(tree.find(entry => entry.path === "src/app.js").sha, null);
    assert.equal(tree.find(entry => entry.path === "src/main.js").sha, "blob0");
  } finally { repo.restore(); }
});

test("الاستكشاف الذكي: أدوات ثم ملاحظات تصل إلى التوليد", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI(
      { tool: "list_dir", args: { path: "src" } },
      { done: true, paths: ["src/app.js"], notes: "NOTE_FROM_EXPLORE" },
      edit("export const a = 2;\n")
    );
    const io = makeIO();
    const result = await run(ai, { options: { agentic: true } }, {}, io);

    assert.equal(ai.requests.length, 3);
    assert.match(lastUserMessage(ai.requests[2]), /NOTE_FROM_EXPLORE/);
    assert.ok(io.events.some(event => event.stage === "explore"));
    assert.deepEqual(result.files, ["src/app.js"]);
  } finally { repo.restore(); }
});

test("فشل الاستكشاف غير قاتل: يتابع الخط بدونه", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI(() => { throw new Error("model down"); });
    // الاستكشاف يفشل، ثم يفشل التوليد أيضًا (النموذج معطّل) فنتحقق أن الاستكشاف سبق ذلك بملاحظة.
    const io = makeIO();

    await assert.rejects(() => run(ai, { options: { agentic: true, attempts: 1 } }, {}, io), UserError);
    assert.ok(io.events.some(event => event.type === "note" && /الاستكشاف/.test(event.message)));
  } finally { repo.restore(); }
});

test("المهارات: التلقائية بالكلمات والمخصصة الدائمة تدخل في الطلب", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({ summary: "x", files: [] });
    const result = await run(ai, {
      task: "افحص ثغرات security في المشروع",
      skills: [{ id: "team-rules", name: "Team Rules", instructions: "Always keep functions under thirty lines.", mode: "always" }]
    });
    const prompt = lastUserMessage(ai.requests[0]);

    assert.match(prompt, /Skill: Security Review/);
    assert.match(prompt, /Always keep functions under thirty lines/);
    assert.ok(result.skills.includes("Security Review"));
    assert.ok(result.skills.includes("Team Rules"));
  } finally { repo.restore(); }
});

test("مهارة معطّلة لا تدخل حتى لو ظهرت كلمتها", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({ summary: "x", files: [] });
    await run(ai, { task: "افحص security", skills: [{ id: "security", mode: "off" }] });

    assert.doesNotMatch(lastUserMessage(ai.requests[0]), /Skill: Security Review/);
  } finally { repo.restore(); }
});

test("فحوصات CI: فشل ثم إصلاح ذاتي ثم نجاح", async () => {
  const repo = makeRepo(FILES);
  try {
    repo.state.checkRuns = sha => [check(sha === "c2" ? 11 : 12, sha === "c2" ? "failure" : "success")];
    repo.state.jobLogs["11"] = "Error: boom in src/app.js:3";

    const ai = fakeAI(edit("export const a = 2;\n"), edit("export const a = 3;\n", "أصلحت"));
    const result = await run(ai, { options: { ciRepair: true, repairRounds: 1 }, timing: FAST });

    assert.equal(result.ci.state, "success");
    assert.equal(result.ci.rounds, 1);
    assert.equal(repo.state.refPatches.length, 1);
    assert.equal(repo.state.treeBodies.length, 2);
    assert.equal(repo.state.treeBodies[1].base_tree, "t2");
    assert.equal(repo.state.treeBodies[1].tree[0].content, "export const a = 3;\n");
    assert.ok(repo.state.comments.some(comment => comment.number === 7));
  } finally { repo.restore(); }
});

test("فحوصات CI: بلا إصلاح عند repairRounds=0، وبلا فحوصات تُعلن none", async () => {
  const failing = makeRepo(FILES);
  try {
    failing.state.checkRuns = () => [check(11, "failure")];
    const result = await run(fakeAI(edit("export const a = 2;\n")), { options: { ciRepair: true, repairRounds: 0 }, timing: FAST });

    assert.equal(result.ci.state, "failure");
    assert.equal(result.ci.rounds, 0);
    assert.equal(failing.state.refPatches.length, 0);
  } finally { failing.restore(); }

  const none = makeRepo(FILES);
  try {
    const result = await run(fakeAI(edit("export const a = 2;\n")), {
      options: { ciRepair: true },
      timing: { ...FAST, firstCheckMs: 0 }
    });

    assert.equal(result.ci.state, "none");
  } finally { none.restore(); }
});

test("إلغاء المهمة قبل النشر: لا فرع ولا commit", async () => {
  const repo = makeRepo(FILES);
  try {
    const io = { events: [], emit: event => io.events.push(event), alive: () => false };

    await assert.rejects(
      () => run(fakeAI(edit("export const a = 2;\n")), {}, {}, io),
      error => error instanceof UserError && /أُلغيت/.test(error.message)
    );
    assert.ok(!repo.calls.some(call => call.startsWith("POST")));
  } finally { repo.restore(); }
});

test("أخطاء GitHub: لا صلاحية كتابة", async () => {
  const repo = makeRepo(FILES, { push: false });
  try {
    await assert.rejects(
      () => run(fakeAI({})),
      error => error instanceof UserError && /صلاحية الكتابة/.test(error.message)
    );
  } finally { repo.restore(); }
});

test("فرع افتراضي باسم يحتوي شرطة مائلة", async () => {
  const repo = makeRepo(FILES, { defaultBranch: "release/1.0" });
  try {
    const result = await run(fakeAI(edit("export const a = 2;\n")));

    assert.equal(result.ok, true);
    assert.equal(repo.state.prBody.base, "release/1.0");
  } finally { repo.restore(); }
});
