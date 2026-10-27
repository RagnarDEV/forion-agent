import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../src/pipeline/index.js";
import { UserError } from "../src/lib/errors.js";
import { baseEnv, fakeAI, makeIO, makeRepo } from "./helpers.js";

const FILES = { "src/app.js": "export const a = 1;\n", "README.md": "# demo\n" };

async function withRepo(files, fn, options) {
  const repo = makeRepo(files, options);
  try { return await fn(repo); } finally { repo.restore(); }
}

test("خط كامل: تعديل ملف ينتج فرعًا وPull Request بدون دمج تلقائي", async () => {
  await withRepo(FILES, async repo => {
    const ai = fakeAI({ summary: "حدّثت القيمة", files: [{ path: "src/app.js", content: "export const a = 2;\n" }] });
    const io = makeIO();

    const result = await runPipeline(baseEnv(ai), { repo: "o/r", task: "غيّر a إلى 2", history: [] }, io);

    assert.equal(result.noChanges, false);
    assert.deepEqual(result.files, ["src/app.js"]);
    assert.equal(result.url, "https://github.com/o/r/pull/7");
    assert.match(result.branch, /^forion-agent-\d{14}-[0-9a-f]{8}$/);
    assert.equal(result.autoMerge.enabled, false);
    assert.deepEqual(io.events.map(event => event.stage), ["scan", "select", "read", "generate", "publish"]);

    assert.equal(repo.state.treeBody.base_tree, "t1");
    assert.equal(repo.state.treeBody.tree[0].content, "export const a = 2;\n");
    assert.equal(repo.state.prBody.base, "main");
    assert.equal(repo.state.graphql, null);
    assert.ok(!repo.calls.some(call => call.includes("graphql")));
  });
});

test("الدمج التلقائي: يُفعَّل عند AUTO_MERGE=true ويبقى الـ PR إن فشل", async () => {
  await withRepo(FILES, async repo => {
    const make = () => fakeAI({ summary: "s", files: [{ path: "README.md", content: "# changed\n" }] });
    const input = { repo: "o/r", task: "عدّل README", history: [] };

    const on = await runPipeline(baseEnv(make(), { AUTO_MERGE: "true" }), input, makeIO());
    assert.equal(on.autoMerge.enabled, true);
    assert.equal(on.autoMerge.mergeMethod, "SQUASH");
    assert.equal(repo.state.graphql.variables.pullRequestId, "PR_7");

    repo.state.graphqlResponse = { errors: [{ message: "Auto merge is not allowed for this repository" }] };
    const failed = await runPipeline(baseEnv(make(), { AUTO_MERGE: "true" }), input, makeIO());
    assert.equal(failed.url, "https://github.com/o/r/pull/7");
    assert.equal(failed.autoMerge.enabled, false);
    assert.match(failed.autoMerge.reason, /not allowed/);
  });
});

test("طلب تحليلي: لا فرع ولا PR", async () => {
  await withRepo(FILES, async repo => {
    const ai = fakeAI({ summary: "المشروع صغير.", files: [] });
    const result = await runPipeline(baseEnv(ai), { repo: "o/r", task: "اشرح المشروع", history: [] }, makeIO());

    assert.equal(result.noChanges, true);
    assert.equal(result.summary, "المشروع صغير.");
    assert.ok(!repo.calls.some(call => call.startsWith("POST")));
  });
});

test("إنشاء ملف جديد يعمل حتى لو لم يُختر أي ملف موجود", async () => {
  const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => ["src/m" + i + ".js", "export {}\n"]));

  await withRepo(many, async repo => {
    const ai = fakeAI(
      { paths: [] },
      { summary: "أنشأت الملف", files: [{ path: "docs/NOTES.md", content: "# notes\n" }] }
    );
    const io = makeIO();

    const result = await runPipeline(baseEnv(ai), { repo: "o/r", task: "أنشئ ملف NOTES.md جديد", history: [] }, io);

    assert.deepEqual(result.files, ["docs/NOTES.md"]);
    assert.equal(repo.state.treeBody.tree[0].path, "docs/NOTES.md");
    assert.ok(io.events.some(event => event.stage === "read" && /لا حاجة/.test(event.message)));
  });
});

test("مستودع فارغ من الملفات النصية: إنشاء مسموح وتعديل مرفوض", async () => {
  await withRepo({ "logo.png": "binary" }, async () => {
    const ai = fakeAI({ summary: "s", files: [{ path: "README.md", content: "# hi\n" }] });
    const created = await runPipeline(baseEnv(ai), { repo: "o/r", task: "create a new file README.md", history: [] }, makeIO());
    assert.deepEqual(created.files, ["README.md"]);

    await assert.rejects(
      runPipeline(baseEnv(fakeAI({})), { repo: "o/r", task: "عدّل الكود", history: [] }, makeIO()),
      UserError
    );
  });
});

test("صلاحيات وأخطاء GitHub تظهر برسائل واضحة", async () => {
  await withRepo(FILES, async () => {
    await assert.rejects(
      runPipeline(baseEnv(fakeAI({})), { repo: "o/r", task: "x", history: [] }, makeIO()),
      UserError
    );
  }, { push: false });

  const repo = makeRepo(FILES);
  try {
    await assert.rejects(
      runPipeline(baseEnv(fakeAI({})), { repo: "o/missing", task: "x", history: [] }, makeIO()),
      error => error instanceof UserError && error.message.includes("غير موجود")
    );
  } finally {
    repo.restore();
  }
});

test("الفرع الافتراضي بشرطة مائلة يُرمَّز بشكل صحيح", async () => {
  await withRepo(FILES, async repo => {
    const ai = fakeAI({ summary: "s", files: [{ path: "README.md", content: "# x\n" }] });
    const result = await runPipeline(baseEnv(ai), { repo: "o/r", task: "عدّل README", history: [] }, makeIO());

    assert.equal(result.noChanges, false);
    assert.ok(repo.calls.includes("GET /repos/o/r/git/ref/heads/release/v1"));
    assert.equal(repo.state.prBody.base, "release/v1");
  }, { defaultBranch: "release/v1" });
});
