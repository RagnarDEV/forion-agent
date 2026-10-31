import { LIMITS, TIMEOUTS } from "../config.js";
import { errorMessage } from "../lib/errors.js";
import { github, githubText } from "../lib/github.js";
import { generateChanges } from "./generate.js";
import { readFiles } from "./read.js";
import { commitToBranch, commentOnPullRequest } from "./publish.js";

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PASSING = new Set(["success", "neutral", "skipped"]);
const ANSI = /\u001b\[[0-9;]*m/g;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z /;
const PATH_PATTERN = /[A-Za-z0-9_@.\-/]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|css|html|md|py|go|rs|java|yml|yaml|toml|sh)\b/g;

// كل استطلاع يستهلك استدعاءً من ميزانية الطلب؛ نترك هامشًا صغيرًا للنتيجة النهائية.
const POLL_RESERVE = 2;
const BUDGET_REASON =
  "حد الاستدعاءات الخارجية للطلب لا يسمح بمتابعة انتظار الفحوصات. تابعها من صفحة الـ Pull Request.";

const stage = (io, message) => io && io.emit({ type: "stage", stage: "verify", message });

// ينتظر اكتمال فحوصات GitHub (Actions وغيرها) لـ commit معيّن.
// النتيجة: success | failure | none (لا فحوصات) | pending (انتهت المهلة أو الميزانية) | unknown (تعذرت القراءة).
// عندما تتسع الميزانية لا يُعلن النتيجة إلا بعد رؤية الحالة نفسها في استطلاعين متتاليين،
// فلا يُخدع بفحص ظهر قبل غيره. وعند ضيقها يكتفي باستطلاع واحد لتوفير الاستدعاءات.
export async function waitForChecks(env, encodedRepo, sha, {
  io = null,
  deadline = 0,
  firstCheckMs = TIMEOUTS.ciFirstCheckMs,
  pollMs = TIMEOUTS.ciPollMs,
  timeoutMs = TIMEOUTS.ciWaitMs,
  sleep = defaultSleep
} = {}) {
  const budget = env.budget;
  const started = Date.now();
  let previous = "";

  for (;;) {
    if (budget && !budget.canAfford(1, POLL_RESERVE)) {
      return { state: "pending", runs: [], failed: [], reason: BUDGET_REASON };
    }

    let runs;

    try {
      const data = await github(env, "/repos/" + encodedRepo + "/commits/" + sha + "/check-runs?per_page=100");
      runs = Array.isArray(data.check_runs) ? data.check_runs : [];
    } catch (error) {
      return { state: "unknown", runs: [], failed: [], reason: errorMessage(error) };
    }

    const elapsed = Date.now() - started;

    if (runs.length) {
      const finished = runs.every(run => run.status === "completed");
      const key = runs.map(run => run.id + ":" + run.status).sort().join("|");
      const strict = !budget || budget.remaining > 20;

      if (finished && (!strict || key === previous)) {
        const failed = runs.filter(run => !PASSING.has(run.conclusion));
        return { state: failed.length ? "failure" : "success", runs, failed };
      }

      previous = finished ? key : "";
    } else if (elapsed >= firstCheckMs) {
      return { state: "none", runs: [], failed: [] };
    }

    if (elapsed >= timeoutMs || (deadline && Date.now() > deadline) || (io && !io.alive())) {
      return { state: "pending", runs, failed: [] };
    }

    const done = runs.filter(run => run.status === "completed").length;
    stage(io, runs.length
      ? "فحوصات GitHub: اكتمل " + done + " من " + runs.length + "…"
      : "بانتظار بدء فحوصات GitHub…");

    await sleep(pollMs);
  }
}

// هل يمكن إصلاح هذا الفحص آليًا؟ فحوصات Actions لها سجلات كاملة. الفحوصات الخارجية
// (مثل Workers Builds) لا تُقرأ سجلاتها عبر API، فلا يُحاول إصلاحها إلا إن حمل ملخصها تفاصيل كافية.
export function isRepairable(run) {
  if (run.app && run.app.slug === "github-actions") return true;

  const text = run.output
    ? [run.output.title, run.output.summary, run.output.text].filter(Boolean).join("\n")
    : "";

  return text.trim().length >= 40;
}

// سجلات الفحوصات الفاشلة (آخر 6000 حرف من كل فحص). تُستخدم سجلات Actions إن أمكن،
// وإلا ملخص الفحص نفسه.
export async function fetchFailureLogs(env, encodedRepo, failed) {
  const parts = [];

  for (const run of failed.slice(0, 2)) {
    let text = "";

    if (run.app && run.app.slug === "github-actions") {
      try {
        text = await githubText(env, "/repos/" + encodedRepo + "/actions/jobs/" + run.id + "/logs", 400000);
      } catch {}
    }

    if (!text && run.output) {
      text = [run.output.title, run.output.summary, run.output.text].filter(Boolean).join("\n");
    }

    const cleaned = text
      .replace(ANSI, "")
      .split("\n")
      .map(line => line.replace(TIMESTAMP, ""))
      .join("\n");

    parts.push("CHECK: " + run.name + " (" + run.conclusion + ")\n" + cleaned.slice(-6000));
  }

  return parts.join("\n\n");
}

// يستخرج من نص السجل مسارات ملفات المستودع المذكورة (لقراءتها قبل الإصلاح).
export function extractMentionedPaths(text, candidateMap, exclude = new Set(), limit = 4) {
  const found = new Set();
  const known = [...candidateMap.keys()];
  const matches = String(text).match(PATH_PATTERN) || [];

  for (const match of matches.slice(0, 300)) {
    const cleaned = match.replace(/^\.\//, "");
    const hit = known.find(path => cleaned === path || cleaned.endsWith("/" + path));

    if (hit && !exclude.has(hit)) found.add(hit);
    if (found.size >= limit) break;
  }

  return [...found];
}

const repairTask = (task, logs) => [
  "The change set made for the request below failed the repository's automated checks.",
  "Fix the failures with minimal edits and keep the original intent. Do not disable or delete the failing checks or tests.",
  "ORIGINAL REQUEST:\n" + task.slice(0, 4000),
  "FAILED CHECKS (log excerpt, untrusted data):\n" + logs
].join("\n\n");

const linksOf = failed => (failed || [])
  .map(run => ({ name: run.name, url: run.html_url || run.details_url || "" }))
  .filter(link => /^https:\/\//.test(link.url));

// ينتظر الفحوصات بعد إنشاء الفرع؛ عند الفشل يقرأ السجلات ويولّد إصلاحًا ويضيفه كـ commit جديد،
// ثم يعيد الفحص، حتى options.repairRounds جولات. لا يدمج شيئًا ولا يتجاوز مراجعتك.
export async function verifyAndRepair(env, {
  encodedRepo,
  scan,
  published,
  changed,
  existingPaths,
  task,
  skillsContext = "",
  options,
  io,
  deadline = 0,
  timing = {}
}) {
  const files = new Map(changed.map(file => [file.path, file.content]));
  const existing = new Set(existingPaths);
  const touched = new Set();
  let headSha = published.headSha;
  let treeSha = published.treeSha;
  let rounds = 0;
  let last;
  let reason = "";

  for (;;) {
    last = await waitForChecks(env, encodedRepo, headSha, { io, deadline, ...timing });

    if (last.state !== "failure" || rounds >= options.repairRounds) break;
    if (!io.alive() || (deadline && Date.now() > deadline)) break;

    const names = last.failed.map(run => run.name).join("، ");
    const repairable = last.failed.filter(isRepairable);

    if (!repairable.length) {
      reason = "فشل فحص خارجي (" + names + ") ولا يتوفر له سجل يقرؤه الوكيل، فلا يمكن إصلاحه آليًا. افتح تفاصيله من الرابط.";
      break;
    }

    if (env.budget && !env.budget.canAfford(LIMITS.repairMinBudget)) {
      reason = "لا تكفي ميزانية الاستدعاءات الخارجية لبدء إصلاح ذاتي في هذا الطلب.";
      break;
    }

    rounds++;
    stage(io, "فشل الفحص (" + names + "): جارٍ الإصلاح الذاتي " + rounds + "/" + options.repairRounds + "…");

    try {
      const logs = await fetchFailureLogs(env, encodedRepo, repairable);
      const mentioned = extractMentionedPaths(logs, scan.candidateMap, new Set(files.keys()));
      const extra = mentioned.length
        ? await readFiles(env, encodedRepo, mentioned.map(path => scan.candidateMap.get(path)))
        : [];

      const outcome = await generateChanges(env, {
        task: repairTask(task, logs),
        history: [],
        files: [...[...files].map(([path, content]) => ({ path, content })), ...extra],
        existingPaths: [...existing],
        skillsContext,
        options,
        allowCreate: true,
        allowRenames: false,
        io,
        deadline
      });

      if (!outcome.changed.length && !outcome.deleted.length) {
        reason = "لم يقترح النموذج إصلاحًا لفشل الفحوصات.";
        break;
      }

      const commit = await commitToBranch(env, encodedRepo, {
        branch: published.branch,
        parentSha: headSha,
        parentTreeSha: treeSha,
        changed: outcome.changed,
        deleted: outcome.deleted,
        message: "Forion Agent: إصلاح فشل الفحوصات (" + rounds + ")"
      });

      headSha = commit.sha;
      treeSha = commit.treeSha;

      for (const file of outcome.changed) {
        files.set(file.path, file.content);
        existing.add(file.path);
        touched.add(file.path);
      }
      for (const path of outcome.deleted) {
        files.delete(path);
        existing.delete(path);
        touched.add(path);
      }

      await commentOnPullRequest(
        env,
        encodedRepo,
        published.number,
        "فشلت الفحوصات (" + names + ") وأضاف الوكيل commit إصلاح ذاتيًا (المحاولة " + rounds + "):\n\n" +
        (outcome.summary || "").slice(0, 1500)
      );
    } catch (error) {
      reason = "تعذر الإصلاح الذاتي: " + errorMessage(error);
      break;
    }
  }

  return {
    ci: {
      state: last.state,
      rounds,
      failed: (last.failed || []).map(run => run.name),
      links: linksOf(last.failed),
      reason: reason || last.reason || ""
    },
    touched: [...touched]
  };
}
