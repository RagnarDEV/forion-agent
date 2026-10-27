import test from "node:test";
import assert from "node:assert/strict";
import { parseModelJSON, askAI, withTimeout } from "../src/lib/ai.js";
import { UserError } from "../src/lib/errors.js";

test("parseModelJSON لا يعدّل محتوى الشيفرة داخل النصوص (HTML وأقواس < >)", () => {
  const payload = {
    summary: "تم",
    files: [{
      path: "a.html",
      content: "<div class=\"x\">a < b && c > d</div>\n// تعليق\n# عنوان\nconst x: Array<string> = [];"
    }]
  };

  assert.deepEqual(parseModelJSON(JSON.stringify(payload), "t"), payload);
});

test("parseModelJSON يقبل أسوار Markdown ونصًا محيطًا", () => {
  const body = '{"summary":"ok","files":[]}';

  assert.deepEqual(parseModelJSON("```json\n" + body + "\n```", "t"), { summary: "ok", files: [] });
  assert.deepEqual(parseModelJSON("Here is the result:\n" + body + "\nDone.", "t"), { summary: "ok", files: [] });
});

test("parseModelJSON يرفض النص الفارغ وغير الصالح برسالة UserError", () => {
  assert.throws(() => parseModelJSON("", "t"), UserError);
  assert.throws(() => parseModelJSON("not json", "t"), UserError);
  assert.throws(() => parseModelJSON('{"summary": "مقطوع', "t"), UserError);
});

test("askAI يستخرج النص من أشكال الاستجابة المختلفة", async () => {
  const shapes = [
    { response: "a" },
    { result: { response: "b" } },
    { choices: [{ message: { content: "c" } }] },
    { output_text: "d" }
  ];

  const seen = [];
  for (const shape of shapes) {
    const env = { MODEL: "m", AI: { run: async () => shape } };
    seen.push(await askAI(env, [{ role: "user", content: "x" }], 10, 1000, "t"));
  }

  assert.deepEqual(seen, ["a", "b", "c", "d"]);
});

test("askAI يرفض الاستجابة بلا نص ويكشف مفاتيحها", async () => {
  const env = { AI: { run: async () => ({ foo: 1 }) } };

  await assert.rejects(
    askAI(env, [{ role: "user", content: "x" }], 10, 1000, "t"),
    error => error instanceof UserError && error.message.includes("foo")
  );
});

test("withTimeout يرفض عند انتهاء المهلة برسالة عربية", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 20, "الاختبار"),
    error => error instanceof UserError && error.message.includes("انتهت مهلة")
  );
});
