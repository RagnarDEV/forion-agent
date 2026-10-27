import { normalizeTask } from "../intent.js";
import { isSafeTextPath } from "../paths.js";

export class SkillsRegistry {
  constructor({ baseUrl = "skills", workspace = null } = {}) {
    this.baseUrl = String(baseUrl || "skills").replace(/^\/+|\/+$/g, "");
    this.workspace = workspace;
    this.skills = new Map();
    this.lastUpdate = 0;
  }

  _isSafeSkillPath(skillPath) {
    if (
      typeof skillPath !== "string" ||
      !/^[a-z0-9-]+$/.test(skillPath)
    ) {
      return false;
    }

    return isSafeTextPath(
      `${this.baseUrl}/${skillPath}/SKILL.md`
    );
  }

  _checkFilePath(domain, skillPath) {
    if (
      typeof domain !== "string" ||
      typeof skillPath !== "string"
    ) {
      return false;
    }

    return isSafeTextPath(
      `${domain}/${skillPath}/SKILL.md`
    );
  }

  registerSkill(skillPath, definition = {}) {
    if (!this._isSafeSkillPath(skillPath)) {
      throw new TypeError("مسار المهارة غير صالح: " + skillPath);
    }

    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      throw new TypeError("تعريف المهارة يجب أن يكون كائنًا صالحًا.");
    }

    const previous = this.skills.get(skillPath);
    const tags = Array.isArray(definition.tags)
      ? [...new Set(
          definition.tags
            .filter((tag) => typeof tag === "string")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean)
        )]
      : [];

    const skill = {
      id: skillPath,
      name:
        typeof definition.name === "string" && definition.name.trim()
          ? definition.name.trim()
          : skillPath,
      description:
        typeof definition.description === "string"
          ? definition.description
          : "",
      version:
        typeof definition.version === "string"
          ? definition.version
          : "1.0",
      tags,
      fullInstructions:
        typeof definition.instructions === "string"
          ? definition.instructions
          : typeof definition.fullInstructions === "string"
            ? definition.fullInstructions
            : "",
      createdAt: previous?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    this.skills.set(skillPath, skill);
    this.lastUpdate = Date.now();

    return { ...skill, tags: [...skill.tags] };
  }

  unregisterSkill(skillPath) {
    const deleted = this.skills.delete(skillPath);

    if (deleted) {
      this.lastUpdate = Date.now();
    }

    return deleted;
  }

  getSkill(skillPath) {
    const skill = this.skills.get(skillPath);

    if (!skill) return null;

    return {
      ...skill,
      tags: [...skill.tags]
    };
  }

  listSkills() {
    return Array.from(this.skills.values()).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      tags: [...skill.tags]
    }));
  }

  listActiveSkills() {
    return Array.from(this.skills.values())
      .filter(
        (skill) =>
          typeof skill.id === "string" &&
          typeof skill.name === "string" &&
          typeof skill.description === "string"
      )
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        tags: [...skill.tags]
      }));
  }

  setInstructions(skillPath, instructions) {
    const skill = this.skills.get(skillPath);

    if (!skill || typeof instructions !== "string") {
      return false;
    }

    skill.fullInstructions = instructions;
    skill.updatedAt = Date.now();
    this.lastUpdate = Date.now();

    return true;
  }

  extractIntentKeywords(rawIntent) {
    const normalized = normalizeTask(rawIntent);

    return normalized.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
  }
}

export function createRegistry(options = {}) {
  return new SkillsRegistry(options);
}
