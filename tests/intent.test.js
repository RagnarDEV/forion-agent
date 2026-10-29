import test from "node:test";
import assert from "node:assert/strict";
import { explicitlyRequestsNewFiles, requestsNoChanges } from "../src/lib/intent.js";

test("طلبات إنشاء ملفات صريحة", () => {
  for (const task of [
    "أنشئ ملف README جديد",
    "انشاء ملف config.js",
    "اضف ملف اختبار للدالة",
    "أضف ملفًا جديدًا للإعدادات",
    "create a new file called utils.js",
    "Create file helpers.py",
    "add a file for logging",
    "I need a new file for the router",
    "create a new test file for the parser"
  ]) {
    assert.equal(explicitlyRequestsNewFiles(task), true, task);
  }
});

test("طلبات التعديل لا تُعد إنشاءًا", () => {
  for (const task of [
    "أضف زرًا في ملف index.html",
    "اضافة تحقق من المدخلات في ملف src/a.js",
    "add a function to the file src/a.js",
    "fix the bug in login.js",
    "حسّن تصميم الواجهة",
    "افحص المشروع دون تغييرات",
    "create tests for file src/a.js",
    "generate docs for file utils.js"
  ]) {
    assert.equal(explicitlyRequestsNewFiles(task), false, task);
  }
});

test("قيم غير نصية", () => {
  assert.equal(explicitlyRequestsNewFiles(undefined), false);
  assert.equal(explicitlyRequestsNewFiles(42), false);
  assert.equal(requestsNoChanges(undefined), false);
  assert.equal(requestsNoChanges(42), false);
});

test("طلبات التحليل بلا تعديل تُكتشف", () => {
  for (const task of [
    "افحص المشروع دون تغييرات",
    "افحص بنية المستودع واشرح أهم الملفات والمشكلات المحتملة دون إجراء تغييرات.",
    "اشرح لي كيف يعمل هذا المشروع، دون إجراء أي تغييرات.",
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
    "fix the bug in login.js"
  ]) {
    assert.equal(requestsNoChanges(task), false, task);
  }
});
