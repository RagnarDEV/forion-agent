import test from "node:test";
import assert from "node:assert/strict";
import { generateChanges } from "../src/pipeline/generate.js";
import { UserError } from "../src/lib/errors.js";
import { baseEnv, fakeAI } from "./helpers.js";

const run = (ai, input) => generateChanges(baseEnv(ai), { history: [], existingPaths: [], ...input });

test("يعدّل ملفًا موجودًا ويحافظ على HTML كما هو", async () => {
  const html = '<!doctype html><div class="a">x < y</div>';
  const ai = fakeAI({ summary: "تم", files: [{ path: "index.html", content: html }] });

  const result = await run(ai, {
    task: "حسّن الصفحة",
    files: [{ path: "index.html", content: "<p>old</p>" }]
  });

  assert.equal(result.summary, "تم");
  assert.deepEqual(result.changed, [{ path: "index.html", content: html }]);
});

test("يتجاهل الملفات غير المتغيرة ويقبل ملفات Python/Go", async () => {
  const ai = fakeAI({
    summary: "ok",
    files: [
      { path: "same.js", content: "a\r\nb" },
      { path: "app.py", content: "print('new')" }
    ]
  });

  const result = await run(ai, {
    task: "عدّل app.py",
    files: [
      { path: "same.js", content: "a\nb" },
      { path: "app.py", content: "print('old')" }
    ]
  });

  assert.deepEqual(result.changed.map(file => file.path), ["app.py"]);
});

test("الطلب التحليلي يُرجع الإجابة بلا تعديلات", async () => {
  const ai = fakeAI({ summary: "المشروع بسيط.", files: [] });
  const result = await run(ai, { task: "اشرح المشروع", files: [{ path: "a.js", content: "x" }] });

  assert.equal(result.summary, "المشروع بسيط.");
  assert.deepEqual(result.changed, []);
});

test("يرفض إنشاء ملف جديد دون طلب صريح", async () => {
  const ai = fakeAI({ summary: "s", files: [{ path: "new.js", content: "x" }] });

  await assert.rejects(
    run(ai, { task: "حسّن الكود", files: [{ path: "a.js", content: "y" }] }),
    error => error instanceof UserError && error.message.includes("ملفات جديدة")
  );
});

test("يسمح بإنشاء ملف جديد عند الطلب الصريح، ويرفض مسارًا موجودًا لم يُرسل", async () => {
  const create = fakeAI({ summary: "s", files: [{ path: "src/logger.js", content: "export {}" }] });
  const ok = await run(create, { task: "أنشئ ملف logger جديد", files: [] });
  assert.deepEqual(ok.changed, [{ path: "src/logger.js", content: "export {}" }]);

  const clash = fakeAI({ summary: "s", files: [{ path: "src/a.js", content: "export {}" }] });
  await assert.rejects(
    run(clash, { task: "أنشئ ملف جديد", files: [], existingPaths: ["src/a.js"] }),
    error => error instanceof UserError && error.message.includes("موجود مسبقًا")
  );
});

test("يرفض أكثر من 3 ملفات جديدة ومسارات غير آمنة", async () => {
  const many = fakeAI({
    summary: "s",
    files: ["a", "b", "c", "d"].map(name => ({ path: name + ".js", content: "x" }))
  });
  await assert.rejects(run(many, { task: "create new files", files: [] }), UserError);

  const unsafe = fakeAI({ summary: "s", files: [{ path: ".env", content: "KEY=1" }] });
  await assert.rejects(run(unsafe, { task: "create new file .env", files: [] }), UserError);
});

test("يرفض الملف المقتطع ولا ينشر شيئًا", async () => {
  const original = "line\n".repeat(800);
  const ai = fakeAI({ summary: "s", files: [{ path: "big.js", content: "// truncated" }] });

  await assert.rejects(
    run(ai, { task: "عدّل", files: [{ path: "big.js", content: original }] }),
    error => error instanceof UserError && error.message.includes("مقتطعة")
  );
});

test("يعيد المحاولة مرة واحدة عند رد غير صالح", async () => {
  const ai = fakeAI("هذا ليس JSON", { summary: "ok", files: [{ path: "a.js", content: "new" }] });

  const result = await run(ai, { task: "عدّل", files: [{ path: "a.js", content: "old" }] });

  assert.equal(ai.requests.length, 2);
  assert.deepEqual(result.changed, [{ path: "a.js", content: "new" }]);
});

test("يفشل بعد ردْين غير صالحين برسالة واضحة", async () => {
  const ai = fakeAI("bad", "still bad");

  await assert.rejects(
    run(ai, { task: "عدّل", files: [{ path: "a.js", content: "old" }] }),
    error => error instanceof UserError && error.message.includes("JSON")
  );
});
