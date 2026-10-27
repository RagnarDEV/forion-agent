import { normalizeTask } from './intent.js';
import { isSafeTextPath } from './paths.js';

/**
 * مسؤول عن تسجيل المهارات واكتشافها وتحديثها.
 * استخدام التصميم الابتكاري: تكامل منطق مهارات متعدد في كائن واحد قوي.
 */
export class SkillsRegistry {
  constructor({ baseUrl = 'skills', workspace = null } = {}) {
    this.baseUrl = baseUrl.startsWith('/') ? baseUrl.slice(1) : baseUrl;
    this.workspace = workspace;
    this.skills = new Map();
    this.lastUpdate = 0;
  }

  /**
   * تحقق من أن مسار المهارة آمن ولا يبدأ بـ ".."
   * @param {string} skillPath - مسار المهارة النسبي (مثال: "code-review")
   * @returns {boolean}
   */
  _isSafeSkillPath(skillPath) {
    if (!skillPath || typeof skillPath !== 'string') return false;
    // ملف Definition المسموح به
    return isSafeTextPath(`${this.baseUrl}/${skillPath}/SKILL.md`);
  }

  /**
   * تحقق من مسار الملف الفعلي (ملف تعريف المهارة) قبل التحليل الأعمق.
   * @param {string} skillPath - مسار المهارة النسبي
   * @returns {boolean}
   */
  _checkFilePath(domain, skillPath) {
    const filePath = `${domain}/${skillPath}/SKILL.md`;
    return isSafeTextPath(filePath);
  }

  /**
   * يضيف أو يحفظ مهارة جديدة.
   * - تطبيقات "انشاء مهارة" للتعريف الأولي.
   * - تعديلات موجودة يتم تطبيقها عند إعادة التحديث/الاكتشاف.
   * @param {string} skillPath - مسار المهارة النسبي
   * @param {Object} definition - تعريف المهارة (JSON منطقي)
   */
  registerSkill(skillPath, definition) {
    const safePath = this._isSafeSkillPath(skillPath);
    // تحقق من أن معرف المهارة قوي، مثال: "code-review"
    const isValidId = /^[a-z0-9-]+$/.test(skillPath);

    if (!isValidId || !safePath) {
      return;
    }

    // منع الكتابة فوق مهارة موجودة عند تعريف جديد؟
    // هذا يسمح بتحديث المهارة باستخدام مرحلة تتطلب من المستخدم "تعديل"
    // "create" هنا تعني "ضبط تعريف جديد".

    this.skills.set(skillPath, {
      name: definition.name || skillPath,
      description: definition.description || '',
      version: definition.version || '1.0',
      tags: Array.isArray(definition.tags) ? definition.tags : [],
      fullInstructions: definition.instructions || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // تحديث الطابع الزمني للسجل
    this.lastUpdate = Date.now();
  }

  /**
   * يزيل مهارة.
   * @param {string} skillPath
   */
  unregisterSkill(skillPath) {
    if (this.skills.has(skillPath)) {
      this.skills.delete(skillPath);
      this.lastUpdate = Date.now();
    }
  }

  /**
   * يحصل على مهارة فورية.
   * لا ينعكس التغيير الخارجي فوراً.
   * @param {string} skillPath
   * @returns {Object|null}
   */
  getSkill(skillPath) {
    return this.skills.get(skillPath) || null;
  }

  /**
   * يعرض جميع المهارات.
   * @returns {Array}
   */
  listSkills() {
    return Array.from(this.skills.values()).map(({ name, description, version, tags }) => ({
      name, description, version, tags
    }));
  }

  /**
   * يعرض المهارات القابلة للتفعيل فقط (التحقق من الصحة: الاسم والأوصاف)
   * @returns {Array}
   */
  listActiveSkills() {
    const active = [];
    for (const [path, skill] of this.skills) {
      if (typeof skill.name === 'string' && typeof skill.description === 'string') {
        active.push({
          id: path,
          name: skill.name,
          description: skill.description,
          version: skill.version
        });
      }
    }
    // عملية تصفية آمنة جداً
    return active;
  }

  /**
   * يبدّل التعليمات الفعليّة للمهارة.
   * @param {string} skillPath
   * @param {string} instructions
   */
  setInstructions(skillPath, instructions) {
    const skill = this.skills.get(skillPath);
    if (skill) {
      skill.fullInstructions = instructions;
      skill.updatedAt = Date.now();
    }
  }

  /**
   * يستخدم طريقة kbs (ما يبغيه المستخدم) لمساعدة التحليل
   */
  extractIntentKeywords(rawIntent) {
    return normalizeTask(rawIntent)
      .match(/[a-z0-9-\s]+/g)
      .filter(x => x.length > 2);
  }
}

/**
 * نسخة اختيارية للسجل التي تدعم التهيئة مع سياق النشاط الحرج (Workspace).
 * Class Factory.
 */
export function createRegistry({ baseUrl, workspace }) {
  return new SkillsRegistry({ baseUrl, workspace });
}
