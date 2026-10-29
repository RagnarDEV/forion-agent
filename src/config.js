// إعدادات مركزية: كل الحدود والمهل في مكان واحد.

export const GITHUB_API = "https://api.github.com";
export const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

export const LIMITS = Object.freeze({
  // الاختيار والقراءة
  maxSelectFiles: 12,
  maxFileBytes: 400000,       // أقصى حجم لملف يُقرأ أو يُعدَّل
  fullRewriteBytes: 24000,    // الملفات الأكبر تُعدَّل بالتحرير الجزئي (edits) لا بإعادة كتابتها كاملة
  maxTotalBytes: 240000,
  maxCandidates: 1500,

  // الطلب والسجل (الأحرف)
  maxTaskChars: 50000,
  maxBodyBytes: 1500000,
  maxHistoryItems: 16,
  maxHistoryChars: 40000,
  maxHistoryTotalChars: 120000,
  maxPromptChars: 300000,

  // المخرجات
  maxOutputTokens: 24000,
  maxNewFiles: 100,
  maxDeletes: 50,
  maxOutputFiles: 120,
  maxEditsPerFile: 60,
  // يُرفض أي ملف يُعاد كاملًا بحجم أقل من هذه النسبة من أصله (حماية من الاقتطاع).
  minKeepRatio: 0.4,

  // المهارات
  maxSkills: 30,
  maxSkillChars: 8000,
  maxSkillsTotalChars: 60000
});

export const TIMEOUTS = Object.freeze({
  selectMs: 180000,
  generateMs: 600000,
  exploreStepMs: 120000,
  taskMs: 1800000,            // السقف الكلي للمهمة الواحدة
  heartbeatMs: 8000,
  ciFirstCheckMs: 40000,      // انتظار ظهور أول فحص بعد الدفع
  ciWaitMs: 420000,           // أقصى انتظار لاكتمال الفحوصات
  ciPollMs: 10000
});

export const RETRY = Object.freeze({
  generateAttempts: 4,
  maxAttempts: 8,
  repairRounds: 2,
  maxRepairRounds: 4,
  exploreSteps: 8
});
