import test from "node:test";
import assert from "node:assert/strict";
import { applyEdits } from "../src/pipeline/patch.js";
import { UserError } from "../src/lib/errors.js";

test("تعديل واحد يستبدل النص مرة واحدة", () => {
  const result = applyEdits("const a = 1;\nconst b = 2;\n", [{ search: "const a = 1;", replace: "const a = 10;" }], "x.js");

  assert.equal(result, "const a = 10;\nconst b = 2;\n");
});

test("عدة تعديلات تُطبَّق بالترتيب (اللاحق يرى نتيجة السابق)", () => {
  const result = applyEdits("one two", [
    { search: "one", replace: "uno" },
    { search: "uno two", replace: "uno dos" }
  ]);

  assert.equal(result, "uno dos");
});

test("رموز $ في replace لا تُفسَّر كأنماط استبدال", () => {
  const result = applyEdits("price = X;", [{ search: "X", replace: "$& and $1" }]);

  assert.equal(result, "price = $& and $1;");
});

test("يرفض النص غير الموجود برسالة مفهومة", () => {
  assert.throws(
    () => applyEdits("abc", [{ search: "zzz", replace: "y" }], "a.js"),
    error => error instanceof UserError && /لم يُعثر على نص search/.test(error.message)
  );
});

test("يرفض النص المكرر", () => {
  assert.throws(
    () => applyEdits("x = 1;\nx = 1;\n", [{ search: "x = 1;", replace: "x = 2;" }], "a.js"),
    error => error instanceof UserError && /مكرر 2 مرات/.test(error.message)
  );
});

test("يرفض edit غير صالح أو قائمة فارغة", () => {
  assert.throws(() => applyEdits("abc", [], "a.js"), UserError);
  assert.throws(() => applyEdits("abc", "nope", "a.js"), UserError);
  assert.throws(() => applyEdits("abc", [{ search: "", replace: "x" }], "a.js"), UserError);
  assert.throws(() => applyEdits("abc", [{ search: "a" }], "a.js"), UserError);
});

test("نهايات الأسطر CRLF تُحفظ كما في الملف الأصلي", () => {
  const result = applyEdits("a\r\nb\r\nc\r\n", [{ search: "b\nc", replace: "B\nC" }]);

  assert.equal(result, "a\r\nB\r\nC\r\n");
});
