import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import * as db from "../src/lib/db.js";
import { matchConversationRoute } from "../src/routes/conversations.js";
import { baseEnv, fakeAI } from "./helpers.js";
import { createFakeD1 } from "./d1-fake.js";

const probe = await createFakeD1();
const skip = probe ? false : "node:sqlite غير متاح في إصدار Node هذا";

const ctx = () => ({ waitUntil() {} });

const call = (env, path, { method = "GET", token = "tok-a", body } = {}) =>
  worker.fetch(new Request("https://forion.test" + path, {
    method,
    headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env, ctx());

const makeEnv = async () => baseEnv(fakeAI({}), { ADMIN_TOKEN: "tok-a,tok-b", DB: await createFakeD1() });

test("redactSecrets يخفي الرموز الفعلية وأنماط GitHub ورؤوس Bearer", () => {
  const env = { ADMIN_TOKEN: "super-admin-secret", GITHUB_TOKEN: "ghp_realtokenvalue1234567890" };
  const text = "a super-admin-secret b ghp_abcdefghijklmnopqrstuvwxyz1234 c Bearer abcdefghijklmnopqrstuv d github_pat_abcdefghijklmnopqrstu";
  const out = db.redactSecrets(text, env);

  assert.doesNotMatch(out, /super-admin-secret|ghp_|abcdefghijklmnopqrstuv|github_pat_/);
  assert.match(out, /\[REDACTED\]/);
  assert.equal(db.redactSecrets("نص عادي", env), "نص عادي");
});

test("مطابقة مسارات المحادثات", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  assert.deepEqual(matchConversationRoute("/api/conversations").allow, ["GET", "POST"]);
  assert.equal(matchConversationRoute("/api/conversations/" + id).id, id);
  assert.deepEqual(matchConversationRoute("/api/conversations/" + id + "/messages").allow, ["GET", "POST"]);
  assert.equal(matchConversationRoute("/api/conversations/not-an-id"), null);
  assert.equal(matchConversationRoute("/api/repos"), null);
});

test("الرسائل تُحفظ بترتيب متسلسل ولا تتكرر بنفس clientId", { skip }, async () => {
  const env = { DB: await createFakeD1() };
  const conversation = await db.createConversation(env, "o1", { repository: "o/r" });

  const first = await db.appendMessage(env, "o1", conversation.id, { role: "user", content: "السلام عليكم", clientId: "c1" });
  const again = await db.appendMessage(env, "o1", conversation.id, { role: "user", content: "السلام عليكم", clientId: "c1" });
  await db.appendMessage(env, "o1", conversation.id, { role: "assistant", content: "أهلًا" });
  await db.appendMessage(env, "o1", conversation.id, { role: "user", content: "ثالثة" });

  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(again.message.id, first.message.id);

  const page = await db.listMessages(env, "o1", conversation.id, {});
  assert.deepEqual(page.messages.map(message => message.sequence), [1, 2, 3]);
  assert.deepEqual(page.messages.map(message => message.role), ["user", "assistant", "user"]);

  // العنوان الافتراضي يُشتق من أول رسالة مستخدم.
  assert.equal((await db.getConversation(env, "o1", conversation.id)).title, "السلام عليكم");
});

test("ترقيم الرسائل: before وlimit وafter", { skip }, async () => {
  const env = { DB: await createFakeD1() };
  const conversation = await db.createConversation(env, "o1", {});

  for (let i = 1; i <= 5; i++) {
    await db.appendMessage(env, "o1", conversation.id, { role: "user", content: "m" + i });
  }

  const latest = await db.listMessages(env, "o1", conversation.id, { limit: 2 });
  assert.deepEqual(latest.messages.map(message => message.sequence), [4, 5]);
  assert.equal(latest.hasMore, true);

  const older = await db.listMessages(env, "o1", conversation.id, { limit: 2, before: 4 });
  assert.deepEqual(older.messages.map(message => message.sequence), [2, 3]);

  const newer = await db.listMessages(env, "o1", conversation.id, { after: 3 });
  assert.deepEqual(newer.messages.map(message => message.sequence), [4, 5]);
  assert.equal(newer.hasMore, false);
});

test("الأسرار لا تُحفظ في محتوى الرسائل", { skip }, async () => {
  const env = { DB: await createFakeD1(), ADMIN_TOKEN: "super-admin-secret" };
  const conversation = await db.createConversation(env, "o1", {});

  const saved = await db.appendMessage(env, "o1", conversation.id, { role: "user", content: "الرمز super-admin-secret للتجربة" });
  assert.doesNotMatch(saved.message.content, /super-admin-secret/);
});

test("العزل بين المالكين والحذف المتسلسل", { skip }, async () => {
  const env = { DB: await createFakeD1() };
  const conversation = await db.createConversation(env, "o1", {});
  await db.appendMessage(env, "o1", conversation.id, { role: "user", content: "سر" });

  assert.equal(await db.getConversation(env, "o2", conversation.id), null);
  assert.equal(await db.listMessages(env, "o2", conversation.id, {}), null);
  assert.equal(await db.appendMessage(env, "o2", conversation.id, { role: "user", content: "x" }), null);
  assert.equal(await db.renameConversation(env, "o2", conversation.id, "اختراق"), null);
  assert.equal(await db.deleteConversation(env, "o2", conversation.id), false);

  assert.equal(await db.deleteConversation(env, "o1", conversation.id), true);
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages").first();
  assert.equal(left.n, 0);
});

test("البحث في العنوان والرسائل والترقيم بمؤشر", { skip }, async () => {
  const env = { DB: await createFakeD1() };
  const a = await db.createConversation(env, "o1", { title: "إصلاح الدخول" });
  const b = await db.createConversation(env, "o1", { title: "شيء آخر" });
  await db.appendMessage(env, "o1", b.id, { role: "user", content: "مشكلة في الدخول" });
  await db.createConversation(env, "o1", { title: "ثالثة" });

  const found = await db.listConversations(env, "o1", { q: "الدخول" });
  assert.deepEqual(found.conversations.map(item => item.id).sort(), [a.id, b.id].sort());

  const page1 = await db.listConversations(env, "o1", { limit: 2 });
  assert.equal(page1.conversations.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = await db.listConversations(env, "o1", { limit: 2, cursor: page1.nextCursor });
  assert.equal(page2.conversations.length, 1);
  assert.equal(page2.nextCursor, null);
});

test("API: دورة كاملة وعزل بين رمزين", { skip }, async () => {
  const env = await makeEnv();

  const created = await call(env, "/api/conversations", { method: "POST", body: { repository: "o/r" } });
  assert.equal(created.status, 201);
  const { conversation } = await created.json();

  const posted = await call(env, "/api/conversations/" + conversation.id + "/messages", {
    method: "POST", body: { content: "مرحبا", clientId: "abc" }
  });
  assert.equal(posted.status, 201);

  const duplicate = await call(env, "/api/conversations/" + conversation.id + "/messages", {
    method: "POST", body: { content: "مرحبا", clientId: "abc" }
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);

  const messages = await (await call(env, "/api/conversations/" + conversation.id + "/messages")).json();
  assert.equal(messages.messages.length, 1);

  // الرمز الآخر يُعد مالكًا مختلفًا: لا يرى المحادثة ولا يعدّلها ولا يحذفها.
  const other = path => call(env, path, { token: "tok-b" });
  assert.equal((await other("/api/conversations/" + conversation.id)).status, 404);
  assert.equal((await other("/api/conversations/" + conversation.id + "/messages")).status, 404);
  assert.equal((await call(env, "/api/conversations/" + conversation.id, { method: "DELETE", token: "tok-b" })).status, 404);
  assert.deepEqual((await (await other("/api/conversations")).json()).conversations, []);

  const renamed = await call(env, "/api/conversations/" + conversation.id, { method: "PATCH", body: { title: "اسم جديد" } });
  assert.equal((await renamed.json()).conversation.title, "اسم جديد");

  assert.equal((await call(env, "/api/conversations/" + conversation.id, { method: "DELETE" })).status, 200);
  assert.equal((await call(env, "/api/conversations/" + conversation.id)).status, 404);
});

test("API: مصادقة ومدخلات وطرق غير مسموحة وغياب D1", async () => {
  const env = baseEnv(fakeAI({}), { ADMIN_TOKEN: "tok-a,tok-b" });
  const id = "11111111-2222-3333-4444-555555555555";

  assert.equal((await call(env, "/api/conversations", { token: "wrong" })).status, 401);
  assert.equal((await call(env, "/api/conversations")).status, 503);
  assert.equal((await call(env, "/api/conversations/" + id, { method: "PUT" })).status, 405);
  assert.equal((await call(env, "/api/conversations/" + id + "/messages", { method: "DELETE" })).status, 405);
  assert.equal((await call(env, "/api/repos", { method: "DELETE" })).status, 405);
  assert.equal((await call(env, "/api/nothing")).status, 404);

  if (probe) {
    const withDb = await makeEnv();
    assert.equal((await call(withDb, "/api/conversations", { method: "POST", body: { title: "   " } })).status, 400);
    assert.equal((await call(withDb, "/api/conversations", { method: "POST", body: { repository: "bad" } })).status, 400);
    assert.equal((await call(withDb, "/api/conversations/" + id + "/messages?before=abc")).status, 400);
  }
});
