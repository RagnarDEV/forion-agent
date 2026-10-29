// أدوات فهم نية المستخدم من نص الطلب.

export function normalizeTask(task) {
  return String(task)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

// طلب تحليل/قراءة فقط: "... دون تغييرات"، "without making any changes"، "read-only".
// يجب أن تنتهي العبارة بنهاية الجملة، فـ "دون تغيير الوظائف" (قيد على تعديل مطلوب)
// لا تُعدّ طلب قراءة فقط.
const NO_CHANGES = [
  /(?:^|\s)(?:دون|بدون|بلا)\s+(?:(?:اجراء|عمل)\s+)?(?:اي\s+)?(?:تغييرات|تعديلات|تغيير|تعديل)\s*(?:[.!؟?،,؛;:]|$)/i,
  /(?:^|\s)without\s+(?:making\s+)?(?:any\s+)?(?:changes|modifications|edits)\s*(?:[.!?,;:]|$)/i,
  /(?:^|\s)(?:do\s+not|don't|dont)\s+(?:change|modify|edit)\s+(?:anything|any\s+files?|files?|the\s+code)\s*(?:[.!?,;:]|$)/i,
  /(?:^|\s)no\s+changes\s*(?:[.!?,;:]|$)/i,
  /(?:^|\s)read[\s-]?only(?:\s|[.!?,;:]|$)/i
];

export function requestsNoChanges(task) {
  if (typeof task !== "string") return false;

  const text = normalizeTask(task);
  return NO_CHANGES.some(pattern => pattern.test(text));
}

// طلب صريح لكتابة تعليق على issue أو Pull Request. أداة التعليق لا تُتاح للنموذج إلا عندها.
const COMMENT = /(?:^|\s)(?:علق|(?:اكتب|اضف|ضع)\s+تعليقا?|comment\s+on|post\s+a\s+comment|leave\s+a\s+comment|add\s+a\s+comment|reply\s+to)/i;

export function requestsComment(task) {
  if (typeof task !== "string") return false;

  return COMMENT.test(normalizeTask(task));
}
