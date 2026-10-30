import test from "node:test";
import assert from "node:assert/strict";
import { isSafeTextPath, rankCandidates } from "../src/lib/paths.js";

test("مسارات نصية آمنة (تشمل CI والإعدادات ليطوّر الوكيل نفسه)", () => {
  for (const path of [
    "src/index.js",
    "public/index.html",
    "README.md",
    "wrangler.toml",
    "package.json",
    ".github/workflows/ci.yml",
    "public/_headers",
    "public/manifest.webmanifest",
    ".gitignore",
    "Dockerfile",
    "app/main.py",
    "cmd/server/main.go"
  ]) {
    assert.equal(isSafeTextPath(path), true, path);
  }
});

test("مسارات ممنوعة: الأسرار والمجلدات المولّدة والخطرة", () => {
  for (const path of [
    ".env",
    ".env.local",
    "config/.env.production",
    "secrets/key.json",
    "credentials.json",
    "node_modules/x/index.js",
    "dist/app.js",
    ".git/config",
    ".wrangler/state/x.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "app.min.js",
    "app.js.map",
    "../outside.js",
    "/abs/path.js",
    "a\\b.js",
    "a//b.js",
    "./a.js",
    "image.png",
    "logo.svg.png",
    "archive.zip",
    "",
    "x".repeat(300) + ".js"
  ]) {
    assert.equal(isSafeTextPath(path), false, path);
  }
});

test("قيم غير نصية", () => {
  assert.equal(isSafeTextPath(undefined), false);
  assert.equal(isSafeTextPath(null), false);
  assert.equal(isSafeTextPath(42), false);
});

test("ترتيب المرشحين: الشيفرة أولًا ثم الأقل عمقًا ثم الأبجدي", () => {
  const sorted = ["docs/guide.md", "src/deep/a.js", "b.js", "a.js", "README.md"]
    .map(path => ({ path }))
    .sort(rankCandidates)
    .map(item => item.path);

  assert.deepEqual(sorted, ["a.js", "b.js", "src/deep/a.js", "README.md", "docs/guide.md"]);
});
