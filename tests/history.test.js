import test from "node:test";
import assert from "node:assert/strict";
import { chatMessages, recentMessages } from "../src/lib/history.js";

const u = content => ({ role: "user", content });
const a = content => ({ role: "assistant", content });

test("يُرجع آخر الرسائل الصالحة فقط", () => {
  const history = [u("1"), a("2"), { role: "system", content: "x" }, { role: "user" }, null, u("3"), a("4")];

  assert.deepEqual(recentMessages(history, 3), [u("3"), a("4")]);
});

test("يحترم حد العدد وميزانية الأحرف", () => {
  const history = [u("aaaa"), a("bbbb"), u("cccc"), a("dddd")];

  assert.deepEqual(recentMessages(history, 2), [u("cccc"), a("dddd")]);
  assert.deepEqual(recentMessages(history, 10, 8), [u("cccc"), a("dddd")]);
  assert.deepEqual(recentMessages(history, 10, 0), []);
});

test("المحادثة تبدأ برسالة مستخدم وتُدمج الرسائل المتتالية", () => {
  assert.deepEqual(recentMessages([a("x"), u("1"), u("2"), a("3")], 10), [u("1\n\n2"), a("3")]);
});

test("رسالة واحدة أكبر من الميزانية: يُبقى ذيلها", () => {
  const result = recentMessages([u("abcdefghij")], 5, 4);

  assert.deepEqual(result, [u("ghij")]);
});

test("مدخلات غير مصفوفة", () => {
  assert.deepEqual(recentMessages(undefined), []);
  assert.deepEqual(recentMessages("x"), []);
});

test("chatMessages: system ثم السجل ثم الطلب", () => {
  const messages = chatMessages("SYS", [u("سابق"), a("رد")], "الطلب");

  assert.deepEqual(messages.map(message => message.role), ["system", "user", "assistant", "user"]);
  assert.equal(messages[3].content, "الطلب");
});

test("chatMessages: سجل ينتهي برسالة مستخدم يُدمج مع الطلب", () => {
  const messages = chatMessages("SYS", [u("سابق")], "الطلب");

  assert.deepEqual(messages.map(message => message.role), ["system", "user"]);
  assert.equal(messages[1].content, "سابق\n\nالطلب");
});
