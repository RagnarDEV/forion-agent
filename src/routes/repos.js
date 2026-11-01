import { json } from "../lib/http.js";
import { errorMessage, errorStatus } from "../lib/errors.js";
import { listRepos } from "../lib/github.js";
import { cleanSecret } from "../lib/security.js";
import { isAutoMergeEnabled } from "../lib/flags.js";
import { LIMITS, RETRY } from "../config.js";
import { baselineModel, publicCatalog } from "../router/catalog.js";
import { DAILY_FREE_NEURONS } from "../router/ledger.js";

export async function handleRepos(request, env) {
  try {
    return json({
      repos: await listRepos(env),
      // النموذج الأساسي للخادم (للتوافق). التوجيه الذكي يختار لكل مرحلة؛ التفاصيل في router.
      model: cleanSecret(env.MODEL) || baselineModel(env),
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
      },
      router: { ...publicCatalog(env), dailyFreeNeurons: DAILY_FREE_NEURONS }
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, errorStatus(error));
  }
}
