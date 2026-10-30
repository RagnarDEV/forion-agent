import test from "node:test";
import assert from "node:assert/strict";
import { UserError } from "../src/lib/errors.js";
import {
  BUILTIN_SKILLS, buildRegistry, buildSkillsContext, pickSkills, sanitizeSkill, slugify
} from "../src/skills/index.js";
import { createRegistry } from "../src/skills/registry.js";

const skill = (overrides = {}) => ({
  id: "my-skill",
  name: "My Skill",
  description: "وصف",
  tags: ["deploy", "نشر"],
  instructions: "Always run the deploy checklist before publishing.",
  ...overrides
});

test("sanitizeSkill: ينظّف الحقول ويضبط الوضع الافتراضي", () => {
  const clean = sanitizeSkill(skill({ id: " My-Skill ", tags: [" Deploy ", "deploy", "", 5] }));

  assert.equal(clean.id, "my-skill");
  assert.deepEqual(clean.tags, ["deploy"]);
  assert.equal(clean.mode, "auto");
});

test("sanitizeSkill: يرفض المعرّف والتعليمات غير الصالحة", () => {
  assert.throws(() => sanitizeSkill(skill({ id: "Bad Id!" })), UserError);
  assert.throws(() => sanitizeSkill(skill({ id: "../x" })), UserError);
  assert.throws(() => sanitizeSkill(skill({ instructions: "   " })), UserError);
  assert.throws(() => sanitizeSkill(null), UserError);
  assert.throws(() => sanitizeSkill([]), UserError);
});

test("slugify", () => {
  assert.equal(slugify("Team Rules!"), "team-rules");
  assert.equal(slugify("قواعد الفريق"), "");
});

test("السجل يُنسخ ولا يتشارك حالة بين الطلبات", () => {
  const first = createRegistry();
  first.register(skill());
  first.get("my-skill").tags.push("mutated");

  assert.deepEqual(first.get("my-skill").tags, ["deploy", "نشر"]);
  assert.equal(createRegistry().has("my-skill"), false);
});

test("buildRegistry: المدمجة موجودة، والمخصصة تُضاف، وأوضاع المدمجة تتغير", () => {
  const { registry, skipped } = buildRegistry([
    skill(),
    { id: "security", mode: "always" },
    { id: "code-review", mode: "off" }
  ]);

  assert.equal(skipped, 0);
  assert.equal(registry.list().length, BUILTIN_SKILLS.length + 1);
  assert.equal(registry.get("security").mode, "always");
  assert.equal(registry.get("code-review").mode, "off");
  assert.equal(registry.get("my-skill").name, "My Skill");
});

test("buildRegistry: العناصر التالفة تُتجاهل ويُحصى عددها", () => {
  const { registry, skipped } = buildRegistry([
    skill({ id: "Bad Id!" }),
    { id: "ghost-skill", mode: "always" },
    "nope",
    null
  ]);

  assert.equal(skipped, 4);
  assert.equal(registry.list().length, BUILTIN_SKILLS.length);
  assert.equal(buildRegistry(undefined).skipped, 0);
});

test("buildRegistry: مهارة مخصصة بمعرّف مدمجة تستبدلها", () => {
  const { registry } = buildRegistry([skill({ id: "security", name: "Our Security", tags: ["secure"] })]);

  assert.equal(registry.get("security").name, "Our Security");
});

test("pickSkills: auto بالكلمات اللاتينية ككلمة كاملة وبالعربية بالاحتواء", () => {
  const { registry } = buildRegistry([skill()]);
  const ids = task => pickSkills(registry, task).map(item => item.id);

  assert.ok(ids("Please run the deploy now").includes("my-skill"));
  assert.ok(ids("جهّز نشر المشروع").includes("my-skill"));
  assert.ok(!ids("redeployment plan").includes("my-skill"));
  assert.ok(ids("افحص ثغرات المشروع").includes("security"));
  assert.ok(ids("Run a SECURITY review").includes("security"));
  assert.deepEqual(ids("كم عدد أيام الأسبوع"), []);
});

test("pickSkills: always دائمًا، وoff أبدًا", () => {
  const { registry } = buildRegistry([
    skill({ mode: "always" }),
    { id: "security", mode: "off" }
  ]);
  const ids = pickSkills(registry, "افحص security").map(item => item.id);

  assert.ok(ids.includes("my-skill"));
  assert.ok(!ids.includes("security"));
});

test("buildSkillsContext: يتضمن الاسم والتعليمات ويلتزم بالميزانية", () => {
  const registry = createRegistry();
  registry.register(skill({ id: "alpha", name: "Alpha", instructions: "A".repeat(300) }));
  registry.register(skill({ id: "beta", name: "Beta", instructions: "B".repeat(300) }));
  const picked = registry.list();

  const full = buildSkillsContext(picked);
  assert.match(full, /### Skill: Alpha/);
  assert.match(full, /### Skill: Beta/);

  const small = buildSkillsContext(picked, 600);
  assert.match(small, /### Skill: Alpha/);
  assert.doesNotMatch(small, /### Skill: Beta/);

  assert.equal(buildSkillsContext([]), "");
  assert.equal(buildSkillsContext(undefined), "");
});
