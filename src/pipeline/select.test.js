import { describe, it, expect, beforeEach } from "vitest";
import {
  selectFiles,
  SKILLS_REGISTRY
} from "./select.js";

const mockEnv = {};

function createScan() {
  const file = {
    path: "src/index.js",
    size: 1000,
    sha: "test-sha"
  };

  return {
    candidates: [file],
    candidateMap: new Map([[file.path, file]]),
    totalBytes: file.size
  };
}

describe("Skills integration in select pipeline", () => {
  beforeEach(() => {
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
  });

  it("detects skills by ID and tags", async () => {
    const result = await selectFiles(mockEnv, {
      task: "Use security and lint skills",
      history: [],
      scan: createScan()
    });

    expect(result.skills.map((skill) => skill.id)).toContain("security");
    expect(result.skills.map((skill) => skill.id)).toContain("lint");
  });

  it("does not select unrelated skills", async () => {
    const result = await selectFiles(mockEnv, {
      task: "Explain the purpose of this JavaScript file",
      history: [],
      scan: createScan()
    });

    expect(result.skills).toHaveLength(0);
    expect(result.skillsContext).toBe("");
  });

  it("includes selected skill instructions in the context", async () => {
    const result = await selectFiles(mockEnv, {
      task: "Perform a security review",
      history: [],
      scan: createScan()
    });

    expect(result.skillsContext).toContain("Security Review");
    expect(result.skillsContext).toContain(
      "Review code for security vulnerabilities."
    );
  });

  it("returns valid files when no skills match", async () => {
    const result = await selectFiles(mockEnv, {
      task: "Review this file for general readability",
      history: [],
      scan: createScan()
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/index.js");
  });

  it("returns registered skill metadata", () => {
    const activeSkills = SKILLS_REGISTRY.listActiveSkills();

    expect(activeSkills.some((skill) => skill.id === "security")).toBe(true);
    expect(
      activeSkills.find((skill) => skill.id === "security").tags
    ).toContain("security");
  });
});
