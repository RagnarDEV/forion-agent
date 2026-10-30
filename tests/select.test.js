import test from "node:test";
import assert from "node:assert/strict";
import { selectFiles } from "../src/pipeline/select.js";
import { LIMITS } from "../src/config.js";
import { UserError } from "../src/lib/errors.js";
import { baseEnv, fakeAI } from "./helpers.js";

function makeScan(paths, size = 100) {
  const candidates = paths.map((path, index) => ({ path, size, sha: "sha" + index }));

  return {
    candidates,
    candidateMap: new Map(candidates.map(file => [file.path, file])),
    totalBytes: candidates.reduce((sum, file) => sum + file.size, 0)
  };
}

const manyPaths = count => Array.from({ length: count }, (_, i) => "src/f" + i + ".js");
const select = (ai, params) => selectFiles(baseEnv(ai), { task: "عدّل", history: [], ...params });

test("مستودع صغير: كل الملفات دون استدعاء النموذج", async () => {
  const ai = fakeAI({});
  const result = await select(ai, { scan: makeScan(["a.js", "b.js", "c.js"]) });

  assert.deepEqual(result.files.map(file => file.path), ["a.js", "b.js", "c.js"]);
  assert.equal(ai.requests.length, 0);
});

test("مستودع كبير: النموذج يختار ولا يتجاوز الحد", async () => {
  const paths = manyPaths(40);
  const ai = fakeAI({ paths: paths.slice(0, 20) });
  const result = await select(ai, { scan: makeScan(paths) });

  assert.equal(ai.requests.length, 1);
  assert.equal(result.files.length, LIMITS.maxSelectFiles);
});

test("يتجاهل مسارات مخترعة", async () => {
  const paths = manyPaths(20);
  const ai = fakeAI({ paths: ["src/f1.js", "ghost.js"] });
  const result = await select(ai, { scan: makeScan(paths) });

  assert.deepEqual(result.files.map(file => file.path), ["src/f1.js"]);
});

test("ملفات الاستكشاف (hints) تُقدَّم وتُضمَّن", async () => {
  const paths = manyPaths(20);
  const ai = fakeAI({ paths: ["src/f2.js"] });
  const result = await select(ai, { scan: makeScan(paths), hints: ["src/f9.js", "ghost.js"] });

  assert.deepEqual(result.files.map(file => file.path), ["src/f9.js", "src/f2.js"]);
});

test("يلتزم بحد الحجم الكلي", async () => {
  const paths = manyPaths(20);
  const ai = fakeAI({ paths: paths.slice(0, 10) });
  const result = await select(ai, { scan: makeScan(paths, 100000) });

  assert.equal(result.files.length, 2);
});

test("اختيار فارغ: مسموح عند الإنشاء، وخطأ عند تعطيله", async () => {
  const scan = makeScan(manyPaths(20));

  const allowed = await select(fakeAI({ paths: [] }), { scan, allowCreate: true });
  assert.deepEqual(allowed, { files: [] });

  await assert.rejects(
    () => select(fakeAI({ paths: [] }), { scan, allowCreate: false }),
    UserError
  );
});

test("مستودع بلا ملفات نصية", async () => {
  const empty = makeScan([]);

  assert.deepEqual(await select(fakeAI({}), { scan: empty, allowCreate: true }), { files: [] });
  await assert.rejects(() => select(fakeAI({}), { scan: empty, allowCreate: false }), UserError);
});

test("ردّ نموذج غير صالح أو خطأ منه يرمي UserError", async () => {
  const scan = makeScan(manyPaths(20));

  await assert.rejects(() => select(fakeAI("not json"), { scan }), UserError);
  await assert.rejects(() => select(fakeAI({ nope: [] }), { scan }), UserError);
  await assert.rejects(() => select(fakeAI(() => { throw new Error("boom"); }), { scan }), UserError);
});

test("مدخلات غير صالحة", async () => {
  await assert.rejects(() => select(fakeAI({}), { task: "  ", scan: makeScan(["a.js"]) }), UserError);
  await assert.rejects(() => select(fakeAI({}), { scan: null }), UserError);
  await assert.rejects(() => select(fakeAI({}), { scan: { candidates: [] } }), UserError);
});
