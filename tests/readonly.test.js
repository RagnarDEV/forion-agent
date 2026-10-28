import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../src/pipeline/index.js";
import { baseEnv, fakeAI, makeIO, makeRepo } from "./helpers.js";

const FILES = { "src/app.js": "export const a = 1;\n", "README.md": "# demo\n" };

test("طلب «دون تغييرات»: لا فرع ولا PR حتى لو اقترح النموذج تعديلًا", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({
      summary: "تحليل فقط.",
      files: [{ path: "src/app.js", content: "export const a = 3;\n" }]
    });

    const result = await runPipeline(
      baseEnv(ai),
      { repo: "o/r", task: "افحص المشروع دون تغييرات", history: [] },
      makeIO()
    );

    assert.equal(result.noChanges, true);
    assert.equal(result.summary, "تحليل فقط.");
    assert.deepEqual(result.files, []);
    assert.ok(!repo.calls.some(call => call.startsWith("POST")));
  } finally { repo.restore(); }
});

test("قيد «دون تغيير الوظائف» لا يمنع التعديل الفعلي", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({
      summary: "عدّلت",
      files: [{ path: "src/app.js", content: "export const a = 2;\n" }]
    });

    const result = await runPipeline(
      baseEnv(ai),
      { repo: "o/r", task: "غيّر القيمة دون تغيير الوظائف الحالية", history: [] },
      makeIO()
    );

    assert.equal(result.noChanges, false);
    assert.deepEqual(result.files, ["src/app.js"]);
  } finally { repo.restore(); }
});
