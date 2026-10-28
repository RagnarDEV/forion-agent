// يحدد ما إذا كان المستخدم يطلب إنشاء ملفات جديدة صراحةً، أو يطلب تحليلًا بلا تعديل.
// القاعدة: الإنشاء مسموح فقط عند وجود صيغة صريحة، وإلا يُعدَّل ما هو موجود فقط.

export function normalizeTask(task) {
  return String(task)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

// كلمات بين فعل الإنشاء وكلمة "ملف" (حتى 3 كلمات)، بشرط ألا تكون حرف جر؛
// فعبارة مثل "create tests for file x" لا تُعد طلب إنشاء ملف جديد.
const BETWEEN =
  "(?:(?!(?:for|in|from|of|to|on|with|inside|within|at|about|في|من|على|عن|الى)\\s)[^\\s]+\\s+){0,3}";

// "أنشئ ملف ..."، "create a new file ..."
const CREATE_FILE = new RegExp(
  "(?:انشاء|انشئ|انشئي|create|generate)\\s+" + BETWEEN +
  "(?:ملف|ملفات|file|files)(?=\\s|$|[.,،:؛])",
  "i"
);

// "أضف ملف ..."، "add a file ..."
const ADD_FILE = /(?:اضف|اضافة|اضافه|add)\s+(?:(?:a|an|new|another)\s+)?(?:ملف|ملفات|file|files)(?=\s|$|[.,،:؛])/i;

// "ملف جديد"، "new file"
const NEW_FILE = /(?:ملفا?\s+جديدا?|ملفات\s+جديدة|ملف\s+جديد|new\s+files?)/i;

export function explicitlyRequestsNewFiles(task) {
  if (typeof task !== "string") return false;

  const text = normalizeTask(task);
  return CREATE_FILE.test(text) || ADD_FILE.test(text) || NEW_FILE.test(text);
}

// طلب تحليل/قراءة فقط: "... دون تغييرات"، "without making any changes"، "read-only".
// يجب أن تنتهي العبارة بنهاية الجملة، فـ "دون تغيير الوظائف" (قيد على تعديل مطلوب) لا تُعد قراءة فقط.
const END = "\\s*(?:[.!؟?،,؛;:]|$)";
const NO_CHANGES = [
  new RegExp(
    "(?:^|\\s)(?:دون|بدون|بلا)\\s+(?:(?:اجراء|عمل)\\s+)?(?:اي\\s+)?" +
    "(?:تغييرات|تعديلات|تغيير|تعديل)" + END, "i"),
  new RegExp(
    "(?:^|\\s)without\\s+(?:making\\s+)?(?:any\\s+)?(?:changes|modifications|edits)" + END, "i"),
  new RegExp(
    "(?:^|\\s)(?:do\\s+not|don't|dont)\\s+(?:change|modify|edit)\\s+" +
    "(?:anything|any\\s+files?|files?|the\\s+code)" + END, "i"),
  new RegExp("(?:^|\\s)no\\s+changes" + END, "i"),
  new RegExp("(?:^|\\s)read[\\s-]?only(?:\\s|[.!?,;:]|$)", "i")
];

export function requestsNoChanges(task) {
  if (typeof task !== "string") return false;

  const text = normalizeTask(task);
  return NO_CHANGES.some(pattern => pattern.test(text));
}
