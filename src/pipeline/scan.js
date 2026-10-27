import { LIMITS } from "../config.js";
import { UserError } from "../lib/errors.js";
import { github, getTree } from "../lib/github.js";
import { isSafeTextPath, rankCandidates } from "../lib/paths.js";

// يتحقق من المستودع والصلاحيات ويبني قائمة الملفات المرشحة.
export async function scanRepository(env, repo, encodedRepo) {
  let meta;
  try {
    meta = await github(env, "/repos/" + encodedRepo);
  } catch (error) {
    if (error.fromGitHub && error.status === 404) {
      throw new UserError("المستودع غير موجود أو لا يملك GITHUB_TOKEN صلاحية الوصول إليه.");
    }
    throw error;
  }

  if (!meta.permissions || !(meta.permissions.push || meta.permissions.admin)) {
    throw new UserError("لا يملك GITHUB_TOKEN صلاحية الكتابة على هذا المستودع.");
  }

  const base = meta.default_branch;
  if (!base) throw new UserError("لم يعثر GitHub على الفرع الافتراضي للمستودع.");

  const snapshot = await getTree(env, repo, base);
  const usable = (snapshot.tree.tree || []).filter(item =>
    item.type === "blob" &&
    isSafeTextPath(item.path) &&
    (item.size || 0) > 0 &&
    (item.size || 0) <= LIMITS.maxFileBytes
  );

  if (!usable.length) {
    throw new UserError(
      "لم أجد ملفات نصية مناسبة للتحليل (الملفات الأكبر من " +
      Math.round(LIMITS.maxFileBytes / 1000) + "KB مستثناة)."
    );
  }

  const candidates = usable
    .map(item => ({ path: item.path, sha: item.sha, size: item.size || 0 }))
    .sort(rankCandidates)
    .slice(0, LIMITS.maxCandidates);

  return {
    meta,
    base,
    snapshot,
    candidates,
    candidateMap: new Map(candidates.map(item => [item.path, item])),
    totalBytes: candidates.reduce((sum, item) => sum + item.size, 0)
  };
}