// أعلام التشغيل المقروءة من متغيرات Worker.

export function isAutoMergeEnabled(env) {
  return String((env && env.AUTO_MERGE) || "").trim().toLowerCase() === "true";
}
