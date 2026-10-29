import { LIMITS } from "../config.js";
import { UserError } from "../lib/errors.js";

function countOccurrences(text, search) {
  let count = 0;
  let index = text.indexOf(search);

  while (index !== -1) {
    count++;
    index = text.indexOf(search, index + search.length);
  }

  return count;
}

// يطبّق تعديلات جزئية {search, replace} على ملف دون إعادة كتابته كاملًا.
// كل search يجب أن يطابق النص الأصلي حرفيًا ومرة واحدة فقط، وإلا يُرفض التعديل
// برسالة تُعاد للنموذج ليصحح نفسه. نهايات الأسطر (CRLF) تُحفظ كما كانت في الملف.
export function applyEdits(original, edits, path = "") {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new UserError("رفض التوليد: قائمة edits فارغة للملف " + path + ".");
  }
  if (edits.length > LIMITS.maxEditsPerFile) {
    throw new UserError("رفض التوليد: عدد edits في " + path + " يتجاوز " + LIMITS.maxEditsPerFile + ".");
  }

  const crlf = original.includes("\r\n");
  let text = original.replace(/\r\n/g, "\n");

  edits.forEach((edit, index) => {
    const label = path + " (edit " + (index + 1) + ")";

    if (!edit || typeof edit.search !== "string" || typeof edit.replace !== "string" || !edit.search) {
      throw new UserError("رفض التوليد: edit غير صالح في " + label + ": يلزم search غير فارغ وreplace نصي.");
    }

    const search = edit.search.replace(/\r\n/g, "\n");
    const replace = edit.replace.replace(/\r\n/g, "\n");
    const count = countOccurrences(text, search);

    if (count === 0) {
      throw new UserError(
        "رفض التوليد: لم يُعثر على نص search في " + label +
        ". يجب أن يطابق النص الموجود في الملف حرفيًا بما فيه المسافات: «" + search.slice(0, 80) + "»"
      );
    }
    if (count > 1) {
      throw new UserError(
        "رفض التوليد: نص search مكرر " + count + " مرات في " + label +
        ". أضف سطورًا محيطة ليصبح فريدًا."
      );
    }

    const at = text.indexOf(search);
    text = text.slice(0, at) + replace + text.slice(at + search.length);
  });

  return crlf ? text.replace(/\n/g, "\r\n") : text;
}
