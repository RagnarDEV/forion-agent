import { toast } from "./toast.js";

export async function copyText(text, message = "تم النسخ.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, "ok", 1800);
    return true;
  } catch {
    toast("تعذر النسخ.", "error");
    return false;
  }
}
