import test from "node:test";
import assert from "node:assert/strict";
import { explore } from "../src/pipeline/explore.js";
import { scanRepository } from "../src/pipeline/scan.js";
import { baseEnv, fakeAI, lastUserMessage, makeIO, makeRepo } from "./helpers.js";

const FILES = { "src/app.js": "export const a = 1;\n", "src/lib/util.js": "export const u = 2;\n", "README.md": "# demo\n" };

async function setup(ai) {
  const env = baseEnv(ai);
  const scan = await scanRepository(env, "o/r", "o/r", { allowEmpty: true });
  return { env, scan };
}

const explorer = (env, scan, task, io = makeIO()) =>
  explore(env, { repo: "o/r", encodedRepo: "o/r", task, history: [], scan, io });

test("read_file ثم done: يُرجع الملفات الصالحة فقط والملاحظات", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI(
      { tool: "read_file", args: { path: "src/app.js" } },
      { done: true, paths: ["src/app.js", "ghost.js"], notes: "وجدت الثابت a" }
    );
    const { env, scan } = await setup(ai);
    const result = await explorer(env, scan, "اشرح الثابت a");

    assert.deepEqual(result.paths, ["src/app.js"]);
    assert.equal(result.notes, "وجدت الثابت a");
    assert.match(lastUserMessage(ai.requests[1]), /export const a = 1/);
  } finally { repo.restore(); }
});

test("list_dir يُظهر محتويات المجلد", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({ tool: "list_dir", args: { path: "src" } }, { done: true, paths: [], notes: "" });
    const { env, scan } = await setup(ai);
    await explorer(env, scan, "ماذا في src؟");

    const result = lastUserMessage(ai.requests[1]);
    assert.match(result, /app\.js/);
    assert.match(result, /lib\//);
  } finally { repo.restore(); }
});

test("search_code يُرجع مسارات ومقاطع", async () => {
  const repo = makeRepo(FILES);
  try {
    repo.state.searchItems = [{ path: "src/app.js", text_matches: [{ fragment: "export const a" }] }];
    const ai = fakeAI({ tool: "search_code", args: { query: "export const" } }, { done: true, paths: [], notes: "" });
    const { env, scan } = await setup(ai);
    await explorer(env, scan, "ابحث عن export");

    assert.match(lastUserMessage(ai.requests[1]), /src\/app\.js: export const a/);
  } finally { repo.restore(); }
});

test("list_issues وget_issue يقرآن الـ issues", async () => {
  const repo = makeRepo(FILES);
  try {
    repo.state.issues = [{ number: 5, state: "open", title: "الخطأ في الدخول", labels: [{ name: "bug" }] }];
    repo.state.issueDetails["5"] = { title: "الخطأ في الدخول", state: "open", body: "تفاصيل الخطأ" };
    const ai = fakeAI(
      { tool: "list_issues", args: {} },
      { tool: "get_issue", args: { number: 5 } },
      { done: true, paths: [], notes: "" }
    );
    const { env, scan } = await setup(ai);
    await explorer(env, scan, "أصلح issue 5");

    assert.match(lastUserMessage(ai.requests[1]), /#5 \[open\] الخطأ في الدخول \(bug\)/);
    assert.match(lastUserMessage(ai.requests[2]), /تفاصيل الخطأ/);
  } finally { repo.restore(); }
});

test("add_comment غير متاحة إلا بطلب صريح لتعليق", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI(
      { tool: "add_comment", args: { number: 3, body: "مرحبًا" } },
      { done: true, paths: [], notes: "" }
    );
    const { env, scan } = await setup(ai);
    await explorer(env, scan, "اشرح المشروع");

    assert.deepEqual(repo.state.comments, []);
    assert.match(lastUserMessage(ai.requests[1]), /Unknown or unavailable tool/);
  } finally { repo.restore(); }
});

test("add_comment تعمل عند طلب تعليق صريح وبحد 3 تعليقات", async () => {
  const repo = makeRepo(FILES);
  try {
    const comment = number => ({ tool: "add_comment", args: { number, body: "ملخص " + number } });
    const ai = fakeAI(comment(1), comment(2), comment(3), comment(4), { done: true, paths: [], notes: "" });
    const { env, scan } = await setup(ai);
    await explorer(env, scan, "علّق على PR 3 بملخص");

    assert.deepEqual(repo.state.comments.map(item => item.number), [1, 2, 3]);
    assert.match(lastUserMessage(ai.requests[4]), /الحد الأقصى للتعليقات/);
  } finally { repo.restore(); }
});

test("JSON تالف أو أداة مجهولة: يُنبَّه النموذج ويكمل", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI("not json", { tool: "rm_rf", args: {} }, { done: true, paths: ["README.md"], notes: "ok" });
    const { env, scan } = await setup(ai);
    const result = await explorer(env, scan, "افحص");

    assert.match(lastUserMessage(ai.requests[1]), /Invalid JSON/);
    assert.match(lastUserMessage(ai.requests[2]), /Unknown or unavailable tool/);
    assert.deepEqual(result.paths, ["README.md"]);
  } finally { repo.restore(); }
});

test("خطأ أداة لا يوقف الحلقة", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({ tool: "get_issue", args: { number: 99 } }, { done: true, paths: [], notes: "x" });
    const { env, scan } = await setup(ai);
    const result = await explorer(env, scan, "اقرأ issue 99");

    assert.match(lastUserMessage(ai.requests[1]), /TOOL RESULT \(get_issue\)/);
    assert.equal(result.notes, "x");
  } finally { repo.restore(); }
});

test("انتهاء الخطوات دون done: يُرجع الملفات التي قرأها النموذج", async () => {
  const repo = makeRepo(FILES);
  try {
    const ai = fakeAI({ tool: "read_file", args: { path: "README.md" } });
    const { env, scan } = await setup(ai);
    const result = await explorer(env, scan, "اقرأ");

    assert.deepEqual(result.paths, ["README.md"]);
  } finally { repo.restore(); }
});
