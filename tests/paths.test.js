import test from "node:test";
import assert from "node:assert/strict";
import { isSafeTextPath, rankCandidates } from "../src/lib/paths.js";

test("المسارات النصية المسموحة", () => {
  for (const path of [
    "src/index.js", "app.py", "README.md", "styles/main.css", "main.go",
    "lib/Foo.java", "db/schema.sql", "scripts/run.sh", "a/b/c.test.js", "icon.svg"
  ]) {
    assert.equal(isSafeTextPath(path), true, path);
  }
});

test("المسارات المحظورة", () => {
  for (const path of [
    ".env", ".env.local", "config/.env", "node_modules/x/index.js",
    ".github/workflows/ci.yml", "../x.js", "/etc/a.js", "a\\b.js", "a//b.js",
    "package-lock.json", "yarn.lock", "bundle.min.js", "app.js.map",
    "logo.svg.png", "image.png", "archive.zip", "secrets/a.json", "credentials.json", ""
  ]) {
    assert.equal(isSafeTextPath(path), false, path);
  }
});

test("ترتيب المرشحين: الشيفرة أولًا ثم الأقل عمقًا", () => {
  const sorted = [
    { path: "docs/guide.md" },
    { path: "src/deep/file.js" },
    { path: "index.js" },
    { path: "README.md" }
  ].sort(rankCandidates).map(item => item.path);

  assert.deepEqual(sorted, ["index.js", "src/deep/file.js", "README.md", "docs/guide.md"]);
});
