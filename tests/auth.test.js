import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { normalizeToken, parseTokenList } from "../src/lib/security.js";
import { baseEnv, fakeAI } from "./helpers.js";

const ctx = () => ({ waitUntil() {} });

// طلب إلى مسار محمي ينتهي بـ 400 (مستودع غير صالح) إن نجحت المصادقة، و401/429 إن فشلت.
const call = (headers, env, ip = "10.0.0.1") =>
  worker.fetch(new Request("https://forion.test/api/task", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...headers },
    body: JSON.stringify({ repo: "bad", task: "x" })
  }), env, ctx());

const env = (extra = {}) => baseEnv(fakeAI({}), extra);

test("normalizeToken: ينظّف المسافات والاقتباس وBearer والأحرف غير المرئية", () => {
  assert.equal(normalizeToken("  abc 123\n"), "abc123");
  assert.equal(normalizeToken("Bearer abc"), "abc");
  assert.equal(normalizeToken("\"abc\""), "abc");
  assert.equal(normalizeToken("a\u200Bb\uFEFFc"), "abc");
  assert.equal(normalizeToken(undefined), "");
  assert.equal(normalizeToken(42), "");
});

test("parseTokenList: عدة رموز بفاصلة أو سطر جديد", () => {
  assert.deepEqual(parseTokenList("one, two\nthree;four"), ["one", "two", "three", "four"]);
  assert.deepEqual(parseTokenList("  \n "), []);
  assert.deepEqual(parseTokenList(undefined), []);
});

test("يقبل X-Admin-Token وAuthorization: Bearer", async () => {
  assert.equal((await call({ "X-Admin-Token": "admin-secret" }, env())).status, 400);
  assert.equal((await call({ "Authorization": "Bearer admin-secret" }, env())).status, 400);
});

test("يقبل الرمز الملصوق بمسافات أو اقتباس", async () => {
  assert.equal((await call({ "X-Admin-Token": " \"admin-secret\" " }, env())).status, 400);
});

test("يدعم عدة رموز في ADMIN_TOKEN (تدوير الرمز)", async () => {
  const multi = env({ ADMIN_TOKEN: "old-token\nnew-token" });

  assert.equal((await call({ "X-Admin-Token": "old-token" }, multi)).status, 400);
  assert.equal((await call({ "X-Admin-Token": "new-token" }, multi)).status, 400);
  assert.equal((await call({ "X-Admin-Token": "third" }, multi)).status, 401);
});

test("بعد 8 محاولات خاطئة يُحظر العنوان مؤقتًا (429) حتى لو أُرسل الرمز الصحيح", async () => {
  const ip = "10.9.9.9";

  for (let i = 0; i < 8; i++) {
    assert.equal((await call({ "X-Admin-Token": "wrong" + i }, env(), ip)).status, 401);
  }

  const blocked = await call({ "X-Admin-Token": "admin-secret" }, env(), ip);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) > 0);

  // عنوان آخر لا يتأثر.
  assert.equal((await call({ "X-Admin-Token": "admin-secret" }, env(), "10.8.8.8")).status, 400);
});

test("طلب بلا رمز لا يُحتسب محاولة خاطئة", async () => {
  const ip = "10.7.7.7";

  for (let i = 0; i < 12; i++) assert.equal((await call({}, env(), ip)).status, 401);
  assert.equal((await call({ "X-Admin-Token": "admin-secret" }, env(), ip)).status, 400);
});
