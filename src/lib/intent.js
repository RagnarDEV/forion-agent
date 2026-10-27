// يحدد ما إذا كان المستخدم يطلب إنشاء ملفات جديدة صراحةً.
// القاعدة: الإنشاء مسموح فقط عند وجود صيغة صريحة، وإلا يُعدَّل ما هو موجود فقط.

export function normalizeTask(task) {
  return String(task)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

// "أنشئ ملف ..."، "create a new file ..."
const CREATE_FILE = /(?:انشاء|انشئ|انشئي|create|generate)\s+(?:[^\s]+\s+){0,3}(?:ملف|ملفات|file|files)(?=\s|$|[.,،:؛])/i;

// "أضف ملف ..."، "add a file ..."
const ADD_FILE = /(?:اضف|اضافة|اضافه|add)\s+(?:(?:a|an|new|another)\s+)?(?:ملف|ملفات|file|files)(?=\s|$|[.,،:؛])/i;

// "ملف جديد"، "new file"
const NEW_FILE = /(?:ملفا?\s+جديدا?|ملفات\s+جديدة|ملف\s+جديد|new\s+files?)/i;

export function explicitlyRequestsNewFiles(task) {
  if (typeof task !== "string") return false;

  const text = normalizeTask(task);
  return CREATE_FILE.test(text) || ADD_FILE.test(text) || NEW_FILE.test(text);
}
