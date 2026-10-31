import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// حارس ضد خطأ حقيقي سبق وقوعه: Element.replaceChildren/append/prepend الأصلية لا تُسطّح المصفوفات،
// فتمرير قائمة (مثل items.map(...)) مباشرة يعرض النص "[object HTMLElement]" في الواجهة.
// يجب تمرير القوائم عبر h() (تُسطّح الأبناء) أو نشرها بـ (...).

const JS_DIR = fileURLToPath(new URL("../public/js", import.meta.url));
const CALLS = /\.(replaceChildren|append|prepend)\(/g;

function topLevelArguments(source, start) {
  const args = [];
  let depth = 0;
  let current = "";
  let quote = "";

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      current += ch;
      if (ch === "\\") { current += source[++i] || ""; continue; }
      if (ch === quote) quote = "";
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; current += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; current += ch; continue; }

    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        if (current.trim()) args.push(current.trim());
        return args;
      }
      depth--;
      current += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  return args;
}

const isUnsafe = argument =>
  !argument.startsWith("...") && (argument.startsWith("[") || /\.(map|filter|flat|flatMap)\(/.test(argument));

test("لا تُمرَّر مصفوفات إلى replaceChildren/append/prepend الأصلية في الواجهة", async () => {
  const files = (await readdir(JS_DIR)).filter(name => name.endsWith(".js"));
  const problems = [];

  for (const name of files) {
    const source = await readFile(path.join(JS_DIR, name), "utf8");

    for (const match of source.matchAll(CALLS)) {
      for (const argument of topLevelArguments(source, match.index + match[0].length)) {
        if (isUnsafe(argument)) {
          const line = source.slice(0, match.index).split("\n").length;
          problems.push("public/js/" + name + ":" + line + " ← " + argument.slice(0, 70));
        }
      }
    }
  }

  assert.deepEqual(problems, [], "مصفوفة تُمرَّر مباشرة إلى DOM:\n" + problems.join("\n"));
});
