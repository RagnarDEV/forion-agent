import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// يستورد كل وحدة في src: يلتقط مسارات الاستيراد الخاطئة والتصديرات المفقودة
// التي لا يكشفها فحص الصياغة وحده (node --check).
const SRC = fileURLToPath(new URL("../src", import.meta.url));

test("كل وحدات src تُستورد دون أخطاء", async () => {
  const entries = await readdir(SRC, { recursive: true });
  const modules = entries.filter(entry => entry.endsWith(".js")).sort();

  assert.ok(modules.length > 20, "عدد الوحدات أقل من المتوقع: " + modules.length);

  for (const entry of modules) {
    await assert.doesNotReject(
      () => import(pathToFileURL(path.join(SRC, entry)).href),
      "فشل استيراد src/" + entry
    );
  }
});
