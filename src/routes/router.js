import { json } from "../lib/http.js";
import { withBudget } from "../lib/budget.js";
import { buildRouterContext } from "../router/input.js";
import { probeModels } from "../router/probe.js";

// POST /api/router/probe — اختبار التوافق الحقيقي لنماذج التوجيه عبر ربط AI في هذا Worker.
// الجسم (اختياري): { router: { settings, ledger } } ليُحاسَب الاختبار على دفتر الحصة المجانية ويتوقف عند نفادها.
export async function handleProbe(request, env) {
  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { ledger } = buildRouterContext(body && body.router);
  const report = await probeModels(withBudget(env), { ledger });

  return json({ report, ledger: ledger.toJSON() });
}
