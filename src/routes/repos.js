import { json } from "../lib/http.js";
import { errorMessage, errorStatus } from "../lib/errors.js";
import { listRepos } from "../lib/github.js";
import { cleanSecret } from "../lib/security.js";
import { isAutoMergeEnabled } from "../lib/flags.js";
import { DEFAULT_MODEL, LIMITS, RETRY } from "../config.js";

export async function handleRepos(request, env) {
  try {
    return json({
      repos: await listRepos(env),
      model: cleanSecret(env.MODEL) || DEFAULT_MODEL,
      autoMerge: isAutoMergeEnabled(env),
      // حدود وقيم افتراضية تعرضها لوحة الإعدادات وتستخدمها الواجهة للتحقق المسبق.
      limits: {
        maxTaskChars: LIMITS.maxTaskChars,
        maxFileBytes: LIMITS.maxFileBytes,
        fullRewriteBytes: LIMITS.fullRewriteBytes,
        maxSkills: LIMITS.maxSkills,
        maxSkillChars: LIMITS.maxSkillChars
      },
      defaults: {
        attempts: RETRY.generateAttempts,
        repairRounds: RETRY.repairRounds
      }
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, errorStatus(error));
  }
}
