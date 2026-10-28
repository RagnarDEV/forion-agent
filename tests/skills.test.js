import test from "node:test";
import assert from "node:assert/strict";
import { selectFiles, SKILLS_REGISTRY } from "../src/pipeline/select.js";

const env = {};

function createScan() {
  const file = { path: "src/index.js", size: 1000, sha: "test-sha" };

  return {
    candidates: [file],
    candidateMap: new Map([[file.path, file]]),
    totalBytes: file.size
  };
}

function registerSkills() {
  SKILLS_REGISTRY.unregisterSkill("lint");
  SKILLS_REGISTRY.unregisterSkill("security");

  SKILLS_REGISTRY.registerSkill("lint", {
    name: "Static Analysis",
    description: "Helper for linting",
    tags: ["code-quality", "lint"],
    instructions: "Review code for linting and quality issues."
  });

  SKILLS_REGISTRY.registerSkill("security", {
    name: "Security Review",
    description: "Review for vulnerabilities",
    tags: ["security"],
    instructions: "Review code for security vulnerabilities."
  });
}

const select = task => selectFiles(env, { task, history: [], scan: createScan() });

test("اكتشاف المهارات بالمعرّف والوسوم", async () => {
  registerSkills();
  const result = await select("Use security and lint skills");
  const ids = result.skills.map(skill => skill.id);

  assert.ok(ids.includes("security"));
  assert.ok(ids.includes("lint"));
});

test("لا تُختار مهارات غير مرتبطة بالطلب", async () => {
  registerSkills();
  const result = await select("Explain the purpose of this JavaScript file");

  assert.equal(result.skills.length, 0);
  assert.equal(result.skillsContext, "");
});

test("تعليمات المهارة المختارة تدخل في السياق", async () => {
  registerSkills();
  const result = await select("Perform a security review");

  assert.ok(result.skillsContext.includes("Security Review"));
  assert.ok(result.skillsContext.includes("Review code for security vulnerabilities."));
});

test("يُرجع الملفات حتى عند عدم طابق مهارات", async () => {
  registerSkills();
  const result = await select("Review this file for general readability");

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, "src/index.js");
});

test("بيانات المهارات المسجّلة", () => {
  registerSkills();
  const security = SKILLS_REGISTRY.listActiveSkills().find(skill => skill.id === "security");

  assert.ok(security);
  assert.ok(security.tags.includes("security"));
});
