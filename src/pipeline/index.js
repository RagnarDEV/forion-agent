import { TIMEOUTS } from "../config.js";
import { UserError, errorMessage } from "../lib/errors.js";
import { encodeRepo } from "../lib/github.js";
import { requestsNoChanges } from "../lib/intent.js";
import { normalizeOptions } from "../lib/options.js";
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

// خط المعالجة: فحص ← استكشاف (اختياري) ← اختيار ← قراءة ← توليد ← نشر ← فحص CI وإصلاح (اختياري).
// input: { repo, task, history, options, skills, timing }
export async function runPipeline(env, input, io) {
  const { repo, task } = input;
  const history = Array.isArray(input.history) ? input.history : [];
  const options = normalizeOptions(input.options);
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

  let hints = [];
  let notes = "";

  if (options.agentic) {
    stage("explore", "جارٍ استكشاف المستودع…");

    try {
      const found = await explore(env, { repo, encodedRepo, task, history, scan, skillsContext, io });
      hints = found.paths;
      notes = found.notes;
    } catch (error) {
      note("تعذر الاستكشاف الذكي وسيتابع الوكيل بدونه: " + errorMessage(error));
    }

    ensureAlive();
  }

  stage("select", "جارٍ اختيار الملفات المناسبة…");

  const selection = await selectFiles(env, { task, history, scan, allowCreate, hints, skillsContext });

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

  const outcome = await generateChanges(env, {
    task: readOnly ? task + READ_ONLY_NOTE : task,
    history,
    files,
    existingPaths: blobPaths,
    skillsContext,
    notes,
    options,
    allowCreate,
    allowRenames: true,
    io,
    deadline
  });

  const nothing = !outcome.changed.length && !outcome.deleted.length && !outcome.renamed.length;

  // طلب قراءة فقط أو لا تغييرات: لا فرع ولا PR مهما اقترح النموذج.
  if (readOnly || nothing) {
    return {
      ok: true,
      noChanges: true,
      summary: outcome.summary || "لم تتطلب المهمة أي تعديل على الملفات.",
      files: [],
      skills: skillNames
    };
  }

  ensureAlive();

  stage("publish", "جارٍ إنشاء الفرع وPull Request…");

  const published = await publishChanges(env, {
    encodedRepo,
    scan,
    summary: outcome.summary || "تعديلات Forion Agent",
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
        timing: input.timing || {}
      });

      result.ci = verified.ci;
      if (verified.touched.length) {
        result.files = [...new Set([...result.files, ...verified.touched])];
      }
    } catch (error) {
      result.ci = { state: "unknown", rounds: 0, failed: [], reason: errorMessage(error) };
    }
  }

  return result;
}
