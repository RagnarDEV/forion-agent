import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// فحص ثابت للواجهة (لا متصفح في الاختبارات): يلتقط أخطاء شائعة لا يكشفها node --check:
//  1) استيراد اسم غير مُصدَّر من وحدة محلية (يكسر الصفحة كلها عند التحميل).
//  2) $("id") لعنصر غير موجود في index.html ولا يُنشأ ديناميكيًا في الشيفرة.

const JS_DIR = fileURLToPath(new URL("../public/js", import.meta.url));
const HTML = fileURLToPath(new URL("../public/index.html", import.meta.url));

const sources = new Map();

async function loadSources() {
  if (sources.size) return sources;

  for (const name of (await readdir(JS_DIR)).filter(file => file.endsWith(".js"))) {
    sources.set(name, await readFile(path.join(JS_DIR, name), "utf8"));
  }

  return sources;
}

function exportsName(source, name) {
  const declaration = new RegExp("export\\s+(?:async\\s+)?(?:function\\*?|const|let|class)\\s+" + name.replace(/\$/g, "\\$") + "\\b");
  if (declaration.test(source)) return true;

  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    const names = match[1].split(",").map(part => part.trim().split(/\s+as\s+/).pop());
    if (names.includes(name)) return true;
  }

  return false;
}

test("كل ما تستورده وحدات الواجهة المحلية مُصدَّر فعلًا", async () => {
  const files = await loadSources();
  const problems = [];

  for (const [file, source] of files) {
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([\w-]+\.js)"/g)) {
      const target = files.get(match[2]);

      if (!target) {
        problems.push(file + " ← ملف غير موجود: " + match[2]);
        continue;
      }

      for (const raw of match[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (name && !exportsName(target, name)) problems.push(file + " ← " + match[2] + " لا يُصدّر " + name);
      }
    }
  }

  assert.deepEqual(problems, []);
});

test("كل $(\"id\") في الواجهة له عنصر في index.html أو يُنشأ في الشيفرة", async () => {
  const files = await loadSources();
  const html = await readFile(HTML, "utf8");
  const known = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));

  for (const source of files.values()) {
    for (const match of source.matchAll(/\bid:\s*"([^"]+)"/g)) known.add(match[1]);
  }

  const missing = [];
  for (const [file, source] of files) {
    for (const match of source.matchAll(/\$\("([\w-]+)"\)/g)) {
      if (!known.has(match[1])) missing.push(file + " ← $(\"" + match[1] + "\")");
    }
  }

  assert.deepEqual(missing, []);
});
