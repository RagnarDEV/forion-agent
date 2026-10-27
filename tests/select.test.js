import test from "node:test";
import assert from "node:assert/strict";
import { selectFiles } from "../src/pipeline/select.js";
import { UserError } from "../src/lib/errors.js";
import { baseEnv, fakeAI } from "./helpers.js";

const scanOf = (list, totalOverride) => {
  const candidates = list.map(([path, size]) => ({ path, sha: "s-" + path, size }));
  return {
    candidates,
    candidateMap: new Map(candidates.map(item => [item.path, item])),
    totalBytes: totalOverride ?? candidates.reduce((sum, item) => sum + item.size, 0)
  };
};

const manyFiles = Array.from({ length: 12 }, (_, i) => ["src/f" + i + ".js", 1000]);

test("المستودع الصغير يُختار كله دون استدعاء النموذج", async () => {
  const ai = fakeAI(() => { throw new Error("لا يجب استدعاء النموذج"); });
  const result = await selectFiles(baseEnv(ai), {
    task: "عدّل", history: [], scan: scanOf([["a.js", 100], ["b.js", 200]])
  });

  assert.deepEqual(result.files.map(file => file.path), ["a.js", "b.js"]);
  assert.equal(ai.requests.length, 0);
});

test("المستودع الكبير: يستخدم مسارات النموذج ويتجاهل غير الموجود", async () => {
  const ai = fakeAI({ paths: ["src/f3.js", "src/ghost.js", "src/f3.js", "src/f1.js"] });
  const result = await selectFiles(baseEnv(ai), { task: "عدّل f3", history: [], scan: scanOf(manyFiles) });

  assert.deepEqual(result.files.map(file => file.path), ["src/f3.js", "src/f1.js"]);
});

test("لا يتجاوز حد 8 ملفات", async () => {
  const ai = fakeAI({ paths: manyFiles.map(([path]) => path) });
  const result = await selectFiles(baseEnv(ai), { task: "عدّل الكل", history: [], scan: scanOf(manyFiles) });

  assert.equal(result.files.length, 8);
});

test("اختيار فارغ: خطأ عادةً، ومسموح عند طلب إنشاء ملف", async () => {
  const empty = () => fakeAI({ paths: [] });

  await assert.rejects(
    selectFiles(baseEnv(empty()), { task: "حسّن الكود", history: [], scan: scanOf(manyFiles) }),
    UserError
  );

  const result = await selectFiles(baseEnv(empty()), {
    task: "أنشئ ملف جديد للاختبارات", history: [], scan: scanOf(manyFiles)
  });
  assert.deepEqual(result, { files: [] });
});

test("مستودع بلا ملفات نصية مع طلب إنشاء", async () => {
  const none = scanOf([]);

  assert.deepEqual(
    await selectFiles(baseEnv(fakeAI({})), { task: "create a new file", history: [], scan: none }),
    { files: [] }
  );
  await assert.rejects(
    selectFiles(baseEnv(fakeAI({})), { task: "عدّل", history: [], scan: none }),
    UserError
  );
});

test("لا توجد حالة مشتركة بين الطلبات", async () => {
  const run = () => selectFiles(baseEnv(fakeAI({})), {
    task: "use skill foo", history: [], scan: scanOf([["a.js", 10]])
  });

  assert.deepEqual(await run(), await run());
});
