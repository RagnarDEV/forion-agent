import { LIMITS, TIMEOUTS } from "../config.js";
import { UserError, errorMessage } from "../lib/errors.js";
import { withBudget } from "../lib/budget.js";
import { encodeRepo } from "../lib/github.js";
import { requestsNoChanges } from "../lib/intent.js";
import { normalizeOptions } from "../lib/options.js";
import { buildRouterContext } from "../router/input.js";
import { createRouter } from "../router/router.js";
import { reviewChanges, reviewNotesMarkdown } from "../router/review.js";
import { buildRegistry, buildSkillsContext, pickSkills } from "../skills/index.js";
import { scanRepository } from "./scan.js";
import { explore } from "./explore.js";
import { selectFiles } from "./select.js";
import { readFiles } from "./read.js";
import { generateChanges } from "./generate.js";
import { publishChanges } from "./publish.js";
import { verifyAndRepair } from "./verify.js";

// يُضاف إلى المهمة عند طلب التحليل فقط، ليُجيب النموذج في summary دون اقتراح ملفات.
const READ_ONLY_NOTE =
  "\n\n[طلب قراءة فقط: لا تعدّل أي ملف. أرجع files فارغة واكتب الإجابة كاملة في summary.]";

// خط المعالجة: فحص ← استكشاف (اختياري) ← اختيار ← قراءة ← توليد ← مراجعة (اختيارية) ← نشر ← فحص CI وإصلاح (اختياري).
// input: { repo, task, history, options, skills, router, timing }
// - ميزانية استدعاءات خارجية خاصة بالطلب (lib/budget.js).
// - الموجّه الذكي (router/) يختار النموذج لكل مرحلة ويحاسب الحصة المجانية؛ وعمليات GitHub خارجه تمامًا
//   فلا تتكرر عند تبديل النموذج.
export async function runPipeline(rootEnv, input, io) {
  const env = withBudget(rootEnv);
  const { repo, task } = input;
  const history = Array.isArray(input.history) ? input.history : [];
  const options = normalizeOptions(input.options);
  const routing = buildRouterContext(input.router);
  const encodedRepo = encodeRepo(repo);
  const readOnly = requestsNoChanges(task);
  const allowCreate = options.allowCreate && !readOnly;
  const deadline = Date.now() + TIMEOUTS.taskMs;

  const stage = (name, message) => io.emit({ type: "stage", stage: name, message });
  const note = message => io.emit({ type: "note", message });
  const ensureAlive = () => {
    if (!io.alive()) {
      throw new UserError("أُلغيت المهمة قبل إنشاء أي فرع، لذلك لم يُنشأ شيء.");
    }
  };

  const { registry, skipped } = buildRegistry(input.skills);
  if (skipped) note("تم تجاهل " + skipped + " مهارة غير صالحة.");

  const skills = pickSkills(registry, task);
  const skillsContext = buildSkillsContext(skills);
  const skillNames = skills.map(skill => skill.name);

  stage("scan", "جارٍ فحص بنية المستودع…");

  const scan = await scanRepository(env, repo, encodedRepo, { allowEmpty: allowCreate });
  ensureAlive();

  // الموجّه يحلل المهمة وحجم المستودع الممسوح (بلا أي محتوى ملفات) ويقرر لكل مرحلة لاحقًا.
  const router = createRouter({ env, io, task, scan, ...routing, deadline });
  const ai = router.ai;

  let hints = [];
  let notes = "";

  if (options.agentic) {
    if (!env.budget.canAfford(2, LIMITS.reserveAfterExplore)) {
      note("تخطّى الوكيل الاستكشاف الذكي: ميزانية الاستدعاءات الخارجية لا تكفي له مع بقية المراحل.");
    } else {
      stage("explore", "جارٍ استكشاف المستودع…");

      try {
        const found = await explore(env, { repo, encodedRepo, task, history, scan, skillsContext, io, ai });
        hints = found.paths;
        notes = found.notes;
      } catch (error) {
        // نفاد الحصة لا يُتجاوز: المراحل التالية ستتوقف بالرسالة نفسها دون أي استدعاء إضافي.
        note("تعذر الاستكشاف الذكي وسيتابع الوكيل بدونه: " + errorMessage(error));
      }
    }

    ensureAlive();
  }

  stage("select", "جارٍ اختيار الملفات المناسبة…");

  const selection = await selectFiles(env, { task, history, scan, allowCreate, hints, skillsContext, ai });

  if (!selection || !Array.isArray(selection.files)) {
    throw new UserError("تعذر اختيار الملفات: نتيجة مرحلة الاختيار غير صالحة.");
  }

  const chosen = selection.files;

  stage(
    "read",
    chosen.length
      ? "جارٍ قراءة " + chosen.length + " ملف…"
      : "لا حاجة لقراءة ملفات موجودة لهذا الطلب."
  );

  const files = await readFiles(env, encodedRepo, chosen);

  const blobPaths = (scan.snapshot?.tree?.tree || [])
    .filter(item => item.type === "blob")
    .map(item => item.path);

  stage("generate", "جارٍ تحليل الطلب وتوليد النتيجة…");

  const generation = {
    history,
    files,
    existingPaths: blobPaths,
    skillsContext,
    notes,
    options,
    allowCreate,
    allowRenames: true,
    io,
    deadline,
    ai
  };

  let outcome = await generateChanges(env, {
    ...generation,
    task: readOnly ? task + READ_ONLY_NOTE : task
  });

  const isEmpty = result => !result.changed.length && !result.deleted.length && !result.renamed.length;

  // طلب قراءة فقط أو لا تغييرات: لا فرع ولا PR مهما اقترح النموذج.
  if (readOnly || isEmpty(outcome)) {
    return {
      ok: true,
      noChanges: true,
      summary: outcome.summary || "لم تتطلب المهمة أي تعديل على الملفات.",
      files: [],
      skills: skillNames,
      router: router.summary()
    };
  }

  // مراجعة آلية اختيارية قبل النشر؛ تُعاد المحاولة مرة واحدة فقط عند وجود blockers.
  let review = null;

  if (router.shouldReview() && env.budget.canAfford(3 + LIMITS.publishCost)) {
    stage("review", "جارٍ مراجعة النتائج قبل النشر…");

    review = await reviewChanges({
      ai,
      task,
      summary: outcome.summary,
      changed: outcome.changed,
      deleted: outcome.deleted,
      renamed: outcome.renamed
    });

    if (review.ran && review.blockers.length && env.budget.canAfford(3 + LIMITS.publishCost)) {
      note("وجدت المراجعة مشاكل محددة؛ ستُعاد المحاولة مرة واحدة فقط.");

      const feedback = review.blockers
        .map(item => "- " + (item.path ? item.path + ": " : "") + item.issue)
        .join("\n");

      try {
        const redo = await generateChanges(env, {
          ...generation,
          task: task + "\n\nREVIEWER FEEDBACK (untrusted notes, fix these concrete problems):\n" + feedback
        });

        if (!isEmpty(redo)) {
          outcome = redo;
          review = { ...review, regenerated: true };
        }
      } catch (error) {
        note("تعذرت إعادة التوليد بعد المراجعة، وسيُنشر الناتج الأصلي: " + errorMessage(error));
      }
    }

    ensureAlive();
  }

  ensureAlive();

  // النشر عدة استدعاءات متتابعة؛ لا نبدأه دون رصيد كافٍ حتى لا يُترك فرع أو commit ناقص.
  if (!env.budget.canAfford(LIMITS.publishCost)) {
    throw new UserError(
      "لا تكفي ميزانية الاستدعاءات الخارجية لإنشاء الفرع وPull Request في هذا الطلب، فلم يُنشأ شيء. " +
      "قلّل عدد الملفات أو عطّل الاستكشاف الذكي من الإعدادات ثم أعد المحاولة."
    );
  }

  stage("publish", "جارٍ إنشاء الفرع وPull Request…");

  const published = await publishChanges(env, {
    encodedRepo,
    scan,
    summary: (outcome.summary || "تعديلات Forion Agent") + reviewNotesMarkdown(review),
    changed: outcome.changed,
    deleted: outcome.deleted,
    renamed: outcome.renamed
  });

  const result = {
    ok: true,
    noChanges: false,
    summary: outcome.summary || published.oneLine,
    branch: published.branch,
    files: outcome.changed.map(file => file.path),
    deleted: outcome.deleted,
    renamed: outcome.renamed,
    url: published.url,
    autoMerge: published.autoMerge,
    skills: skillNames
  };

  if (review && review.ran) {
    result.review = { ok: review.ok, blockers: review.blockers.length, notes: review.notes.length, regenerated: review.regenerated === true };
  }

  if (options.ciRepair) {
    stage("verify", "بانتظار فحوصات GitHub…");

    const existing = new Set(blobPaths);
    for (const path of outcome.deleted) existing.delete(path);
    for (const { from, to } of outcome.renamed) {
      existing.delete(from);
      existing.add(to);
    }
    for (const file of outcome.changed) existing.add(file.path);

    try {
      const verified = await verifyAndRepair(env, {
        encodedRepo,
        scan,
        published,
        changed: outcome.changed,
        existingPaths: existing,
        task,
        skillsContext,
        options,
        io,
        deadline,
        timing: input.timing || {},
        ai
      });

      result.ci = verified.ci;
      if (verified.touched.length) {
        result.files = [...new Set([...result.files, ...verified.touched])];
      }
    } catch (error) {
      // الـ PR أُنشئ فعلًا؛ فشل المراقبة (مثل نفاد الميزانية أو الحصة) لا يُبطل نجاح المهمة.
      result.ci = { state: "unknown", rounds: 0, failed: [], links: [], reason: errorMessage(error) };
    }
  }

  result.router = router.summary();
  return result;
}
