// إعدادات مركزية: كل الحدود والمهل في مكان واحد.

export const GITHUB_API = "https://api.github.com";
export const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

export const LIMITS = Object.freeze({
  maxSelectFiles: 8,
  maxFileBytes: 24000,
  maxTotalBytes: 70000,
  maxCandidates: 700,
  maxTaskChars: 50000,
  maxHistoryItems: 6,
  maxHistoryChars: 15000,
  maxNewFiles: 3,
  // يُرفض أي ملف يعود أصغر من هذه النسبة من أصله (حماية من الاقتطاع).
  minKeepRatio: 0.4
});

export const TIMEOUTS = Object.freeze({
  selectMs: 90000,
  generateMs: 170000,
  heartbeatMs: 8000
});