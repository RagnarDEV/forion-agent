// أنواع الأخطاء ورسائلها الموجَّهة للمستخدم.

export class UserError extends Error {}

const GITHUB_HINTS = new Map([
  [401, "رمز GITHUB_TOKEN غير صالح أو منتهي."],
  [403, "رفض GitHub الطلب: صلاحيات GITHUB_TOKEN غير كافية أو تم تجاوز حد الطلبات."],
  [404, "لم يجد GitHub المورد المطلوب، أو لا يملك الرمز صلاحية الوصول إليه."],
  [409, "رفض GitHub العملية (قد يكون المستودع فارغًا أو الفرع موجودًا)."],
  [422, "رفض GitHub العملية (قد يكون المستودع فارغًا أو الفرع موجودًا)."]
]);

export function describeGitHubError(error) {
  const status = error.status;
  const detail = String(error.message || "").slice(0, 500);
  let hint = GITHUB_HINTS.get(status) || "فشل طلب GitHub.";
  if (status >= 500) hint = "خطأ مؤقت من GitHub. أعد المحاولة بعد قليل.";
  return hint + "\n" + detail;
}

export function errorMessage(error) {
  if (error instanceof UserError) return error.message;
  if (error && error.fromGitHub) return describeGitHubError(error);

  const message = String((error && error.message) || error || "خطأ غير متوقع");
  if (/too many subrequests/i.test(message)) {
    return "تجاوز الطلب حد الاستدعاءات الخارجية في Cloudflare. قلّل نطاق الطلب أو عدد الملفات.";
  }
  return "خطأ غير متوقع: " + message.slice(0, 600);
}

export function errorStatus(error) {
  if (error instanceof UserError) return 400;
  if (error && error.fromGitHub) return 502;
  return 500;
}
