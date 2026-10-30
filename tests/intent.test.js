import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTask, requestsComment, requestsNoChanges } from "../src/lib/intent.js";

test("normalizeTask: يزيل التشكيل ويوحّد الألف ويخفض الحروف", () => {
  assert.equal(normalizeTask("أَنشِئ ملفًّا"), "انشئ ملفا");
  assert.equal(normalizeTask("READ-Only"), "read-only");
});

test("قيم غير نصية", () => {
  assert.equal(requestsNoChanges(undefined), false);
  assert.equal(requestsNoChanges(42), false);
  assert.equal(requestsComment(undefined), false);
  assert.equal(requestsComment(42), false);
});

test("طلبات التحليل بلا تعديل تُكتشف", () => {
  for (const task of [
    "افحص المشروع دون تغييرات",
    "افحص بنية المستودع واشرح أهم الملفات والمشكلات المحتملة دون إجراء تغييرات.",
    "اشرح لي كيف يعمل هذا المشروع خطوة بخطوة، دون إجراء أي تغييرات.",
    "review the code without making any changes.",
    "Review this repo, no changes",
    "read-only review please",
    "don't modify anything"
  ]) {
    assert.equal(requestsNoChanges(task), true, task);
  }
});

test("قيود التعديل ليست طلب قراءة فقط", () => {
  for (const task of [
    "حسّن الواجهة دون تغيير الوظائف الحالية",
    "refactor this function without changing behavior",
    "أضف زرًا في الصفحة",
    "fix the bug in login.js",
    "أنشئ ملف config.js جديدًا"
  ]) {
    assert.equal(requestsNoChanges(task), false, task);
  }
});

test("طلب التعليق الصريح على issue أو PR", () => {
  for (const task of [
    "علّق على PR 3 بملخص التغييرات",
    "اكتب تعليقًا على issue 12",
    "أضف تعليقا على الـ pull request",
    "comment on issue 5 with the findings",
    "please post a comment on the PR",
    "reply to the review"
  ]) {
    assert.equal(requestsComment(task), true, task);
  }
});

test("طلبات عادية لا تُفعّل أداة التعليق", () => {
  for (const task of [
    "اشرح المشروع",
    "أضف تعليقات توضيحية في الكود",
    "fix the failing test",
    "remove the old comments from utils.js"
  ]) {
    assert.equal(requestsComment(task), false, task);
  }
});
