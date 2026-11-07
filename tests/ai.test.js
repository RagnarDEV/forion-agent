import test from "node:test";
import assert from "node:assert/strict";
import { describeResponseShape, extractResponseText, fromResponsesOutput, parseModelJSON, askAI, withTimeout } from "../src/lib/ai.js";
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

test("extractResponseText يستخرج غلاف OpenAI المتداخل داخل response دون تسريب الغلاف", () => {
  const body = { id: "chatcmpl_x", object: "chat.completion", choices: [{ message: { content: "النص الحقيقي" } }], usage: { prompt_tokens: 2 } };
  assert.equal(extractResponseText({ response: body }), "النص الحقيقي");
  assert.equal(extractResponseText({ result: { response: body } }), "النص الحقيقي");
  assert.equal(extractResponseText(body), "النص الحقيقي");
  assert.notEqual(extractResponseText(body), JSON.stringify(body));
});

test("extractResponseText يحافظ على ترتيب أجزاء المحتوى ويتجاهل reasoning", () => {
  const chat = {
    choices: [{ message: { content: [
      { type: "reasoning", text: "لا تُضمّن" },
      { type: "text", text: "أول" },
      { type: "output_text", text: " وثانٍ" }
    ] } }]
  };
  const responses = {
    output: [
      { type: "reasoning", content: [{ type: "reasoning_text", text: "لا تُضمّن" }] },
      { type: "message", content: [{ type: "output_text", text: "أول" }, { type: "text", text: " وثانٍ" }] }
    ]
  };

  assert.equal(extractResponseText(chat), "أول وثانٍ");
  assert.equal(extractResponseText(responses), "أول وثانٍ");
  assert.equal(fromResponsesOutput(responses.output), "أول وثانٍ");
  assert.equal(extractResponseText({ output: [{ type: "output_text", text: "مباشر" }] }), "مباشر");
});

test("extractResponseText يدعم choices.text وoutput_text ويرفض أغلفة metadata الفارغة", () => {
  assert.equal(extractResponseText({ choices: [{ text: "legacy" }] }), "legacy");
  assert.equal(extractResponseText({ output_text: "output" }), "output");
  assert.equal(extractResponseText({ id: "x", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop" }], usage: {} }), null);
  assert.equal(extractResponseText({ output: [{ type: "reasoning", text: "thinking" }] }), null);
});

test("describeResponseShape يعرض الأنواع والمفاتيح فقط دون محتوى الاستجابة", () => {
  const shape = describeResponseShape({ id: "secret-id", choices: [{ message: { content: [{ type: "text", text: "SECRET" }] } }] });
  assert.match(shape, /keys=id,choices/);
  assert.match(shape, /choices=array/);
  assert.match(shape, /contentTypes=\[object:text\]/);
  assert.equal(shape.includes("SECRET"), false);
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
