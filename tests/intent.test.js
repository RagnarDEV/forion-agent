import test from "node:test";
import assert from "node:assert/strict";
import { explicitlyRequestsNewFiles } from "../src/lib/intent.js";

test("طلبات إنشاء ملفات صريحة", () => {
  for (const task of [
    "أنشئ ملف README جديد",
    "انشاء ملف config.js",
    "اضف ملف اختبار للدالة",
    "أضف ملفًا جديدًا للإعدادات",
    "create a new file called utils.js",
    "Create file helpers.py",
    "add a file for logging",
    "I need a new file for the router"
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
    "افحص المشروع دون تغييرات"
  ]) {
    assert.equal(explicitlyRequestsNewFiles(task), false, task);
  }
});

test("قيم غير نصية", () => {
  assert.equal(explicitlyRequestsNewFiles(undefined), false);
  assert.equal(explicitlyRequestsNewFiles(42), false);
});
