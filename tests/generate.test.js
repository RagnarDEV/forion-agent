import test from "node:test";
import assert from "node:assert/strict";
import { generateChanges } from "../src/pipeline/generate.js";
import { UserError } from "../src/lib/errors.js";
import { baseEnv, fakeAI, lastUserMessage } from "./helpers.js";

const run = (ai, params = {}) =>
  generateChanges(baseEnv(ai), { task: "غيّر", history: [], files: [], ...params });

test("يعدّل ملفًا موجودًا ويحافظ على HTML داخل النص", async () => {
  const ai = fakeAI({
    summary: "تم",
    files: [{ path: "index.html", content: "<div class=\"a\">new</div>\n" }]
  });

  const result = await run(ai, { files: [{ path: "index.html", content: "<div>old</div>\n" }] });

  assert.deepEqual(result.changed, [{ path: "index.html", content: "<div class=\"a\">new</div>\n" }]);
  assert.equal(result.summary, "تم");
  assert.deepEqual(result.deleted, []);
  assert.deepEqual(result.renamed, []);
});

test("يتجاهل الملفات غير المتغيرة ويقبل لغات أخرى", async () => {
  const ai = fakeAI({
    summary: "تم",
    files: [
      { path: "a.py", content: "print(2)\n" },
      { path: "b.go", content: "package main\n" }
    ]
  });

  const result = await run(ai, {
    files: [
      { path: "a.py", content: "print(1)\n" },
      { path: "b.go", content: "package main\n" }
    ]
  });

  assert.deepEqual(result.changed.map(file => file.path), ["a.py"]);
});

test("طلب تحليلي: لا ملفات متغيرة والإجابة في summary", async () => {
  const ai = fakeAI({ summary: "شرح", files: [] });
  const result = await run(ai, { files: [{ path: "a.js", content: "x" }] });

  assert.deepEqual(result.changed, []);
  assert.equal(result.summary, "شرح");
});

test("يرفض إنشاء الملفات عند تعطيله في الإعدادات", async () => {
  const ai = fakeAI({ summary: "x", files: [{ path: "new.js", content: "export {};\n" }] });

  await assert.rejects(
    () => run(ai, { allowCreate: false, options: { attempts: 1 } }),
    error => error instanceof UserError && /معطّل/.test(error.message)
  );
});

test("يسمح بإنشاء عدد كبير من الملفات الجديدة بلا سقف ضيق", async () => {
  const files = Array.from({ length: 6 }, (_, i) => ({ path: "docs/n" + i + ".md", content: "# " + i + "\n" }));
  const result = await run(fakeAI({ summary: "x", files }));

  assert.equal(result.changed.length, 6);
});

test("يرفض مسارًا موجودًا في المستودع لم يُرسل للتعديل", async () => {
  const ai = fakeAI({ summary: "x", files: [{ path: "README.md", content: "# جديد\n" }] });

  await assert.rejects(
    () => run(ai, { existingPaths: ["README.md"], options: { attempts: 1 } }),
    error => /موجود مسبقًا/.test(error.message)
  );
});

test("يرفض الأسرار والمسارات الخطرة", async () => {
  for (const path of [".env", "../evil.js", "config/credentials.json"]) {
    const ai = fakeAI({ summary: "x", files: [{ path, content: "KEY=1\n" }] });

    await assert.rejects(
      () => run(ai, { options: { attempts: 1 } }),
      error => /مسار غير آمن/.test(error.message),
      path
    );
  }
});

test("يسمح بتعديل ملفات CI والإعدادات ليطوّر الوكيل نفسه", async () => {
  const ai = fakeAI({
    summary: "x",
    files: [{ path: ".github/workflows/ci.yml", content: "name: ci2\n" }]
  });

  const result = await run(ai, { files: [{ path: ".github/workflows/ci.yml", content: "name: ci\n" }] });

  assert.deepEqual(result.changed.map(file => file.path), [".github/workflows/ci.yml"]);
});

test("يرفض الملف المقتطع (أقصر كثيرًا من أصله)", async () => {
  const ai = fakeAI({ summary: "x", files: [{ path: "a.txt", content: "y" }] });

  await assert.rejects(
    () => run(ai, { files: [{ path: "a.txt", content: "x".repeat(2000) }], options: { attempts: 1 } }),
    error => /مقتطعة/.test(error.message)
  );
});

test("edits: تعديل جزئي لملف أكبر من حد إعادة الكتابة الكاملة", async () => {
  const original = Array.from({ length: 2000 }, (_, i) => "const v" + i + " = " + i + ";").join("\n") + "\n";
  assert.ok(original.length > 24000);

  const ai = fakeAI({
    summary: "x",
    files: [{ path: "big.js", edits: [{ search: "const v1500 = 1500;", replace: "const v1500 = 'x';" }] }]
  });

  const result = await run(ai, { files: [{ path: "big.js", content: original }] });

  assert.equal(ai.requests.length, 1);
  assert.equal(result.changed.length, 1);
  assert.ok(result.changed[0].content.includes("const v1500 = 'x';"));
  assert.ok(result.changed[0].content.includes("const v1999 = 1999;"));
});

test("edit لا يطابق: يُعاد للنموذج مع سبب الرفض ثم ينجح", async () => {
  const ai = fakeAI(
    { summary: "x", files: [{ path: "a.js", edits: [{ search: "غير موجود", replace: "y" }] }] },
    { summary: "ok", files: [{ path: "a.js", edits: [{ search: "const a = 1;", replace: "const a = 2;" }] }] }
  );

  const result = await run(ai, { files: [{ path: "a.js", content: "const a = 1;\n" }] });

  assert.equal(result.attempts, 2);
  assert.equal(result.changed[0].content, "const a = 2;\n");
  assert.match(lastUserMessage(ai.requests[1]), /PREVIOUS ATTEMPT FAILED/);
  assert.match(lastUserMessage(ai.requests[1]), /لم يُعثر على نص search/);
});

test("حذف ونقل الملفات", async () => {
  const ai = fakeAI({
    summary: "رتّبت",
    files: [],
    deletes: ["old/b.js"],
    renames: [{ from: "c.js", to: "d.js" }]
  });

  const result = await run(ai, {
    files: [{ path: "a.js", content: "x" }],
    existingPaths: ["a.js", "old/b.js", "c.js"]
  });

  assert.deepEqual(result.deleted, ["old/b.js"]);
  assert.deepEqual(result.renamed, [{ from: "c.js", to: "d.js" }]);
});

test("يرفض حذف ملف غير موجود ونقله", async () => {
  const del = fakeAI({ summary: "x", files: [], deletes: ["ghost.js"] });
  await assert.rejects(
    () => run(del, { existingPaths: ["a.js"], options: { attempts: 1 } }),
    error => /غير موجود/.test(error.message)
  );

  const move = fakeAI({ summary: "x", files: [], renames: [{ from: "ghost.js", to: "b.js" }] });
  await assert.rejects(
    () => run(move, { existingPaths: ["a.js"], options: { attempts: 1 } }),
    error => /غير موجود/.test(error.message)
  );
});

test("يرفض إعادة التسمية عند منعها", async () => {
  const ai = fakeAI({ summary: "x", files: [], renames: [{ from: "a.js", to: "b.js" }] });

  await assert.rejects(
    () => run(ai, { existingPaths: ["a.js"], allowRenames: false, options: { attempts: 1 } }),
    error => /غير مسموحة/.test(error.message)
  );
});

test("يعيد المحاولة بعد JSON تالف", async () => {
  const ai = fakeAI("not json", { summary: "تم", files: [{ path: "n.js", content: "export {};\n" }] });
  const result = await run(ai);

  assert.equal(ai.requests.length, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.changed.length, 1);
});

test("يفشل بعد استنفاد المحاولات برسالة واضحة", async () => {
  const ai = fakeAI("bad");

  await assert.rejects(
    () => run(ai, { options: { attempts: 2 } }),
    error => error instanceof UserError && /JSON/.test(error.message) && /محاولات/.test(error.message)
  );
  assert.equal(ai.requests.length, 2);
});

test("عدد المحاولات الافتراضي 4", async () => {
  const ai = fakeAI("bad");

  await assert.rejects(() => run(ai));
  assert.equal(ai.requests.length, 4);
});

test("ملاحظات الاستكشاف وتعليمات المهارات تدخل في الطلب", async () => {
  const ai = fakeAI({ summary: "x", files: [] });
  await run(ai, { notes: "NOTE_FROM_EXPLORE", skillsContext: "SKILL_INSTRUCTIONS" });

  const prompt = lastUserMessage(ai.requests[0]);
  assert.match(prompt, /NOTE_FROM_EXPLORE/);
  assert.match(prompt, /SKILL_INSTRUCTIONS/);
});

test("سجل ينتهي برسالة مستخدم يُدمج مع الطلب (لا رسالتان متتاليتان)", async () => {
  const ai = fakeAI({ summary: "x", files: [] });
  await run(ai, { history: [{ role: "user", content: "سؤال سابق" }] });

  assert.deepEqual(ai.requests[0].messages.map(message => message.role), ["system", "user"]);
  assert.match(lastUserMessage(ai.requests[0]), /سؤال سابق/);
});

test("يرفض مدخلات غير صالحة", async () => {
  await assert.rejects(() => run(fakeAI({}), { task: "" }), UserError);
  await assert.rejects(() => run(fakeAI({}), { files: "nope" }), UserError);
  await assert.rejects(() => run(fakeAI({}), { files: [{ path: "a.js" }] }), UserError);
});
