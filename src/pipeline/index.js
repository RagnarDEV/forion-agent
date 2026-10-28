import { UserError } from "../lib/errors.js";
import { encodeRepo } from "../lib/github.js";
import { explicitlyRequestsNewFiles, requestsNoChanges } from "../lib/intent.js";
import { scanRepository } from "./scan.js";
import { selectFiles } from "./select.js";
import { readFiles } from "./read.js";
import { generateChanges } from "./generate.js";
import { publishChanges } from "./publish.js";

// يُضاف إلى المهمة عند طلب التحليل فقط، ليُجيب النموذج في summary دون اقتراح ملفات.
const READ_ONLY_NOTE =
  "\n\n[طلب قراءة فقط: لا تعدّل أي ملف. أرجع files فارغة واكتب الإجابة كاملة في summary.]";

// خط المعالجة: فحص ← اختيار ← قراءة ← توليد ← نشر.
export async function runPipeline(env, input, io) {
  const { repo, task, history } = input;
  const encodedRepo = encodeRepo(repo);
  const readOnly = requestsNoChanges(task);
  const creationAllowed = explicitlyRequestsNewFiles(task) && !readOnly;

  const stage = (name, message) =>
    io.emit({ type: "stage", stage: name, message });

  stage("scan", "جارٍ فحص بنية المستودع…");

  const scan = await scanRepository(
    env,
    repo,
    encodedRepo,
    { allowEmpty: creationAllowed }
  );

  stage("select", "جارٍ اختيار الملفات المناسبة…");

  // selectFiles يرمي UserError بنفسه إن لم يجد ملفات مناسبة (إلا عند الإنشاء الصريح).
  const selection = await selectFiles(env, {
    task,
    history,
    scan
  });

  if (!selection || !Array.isArray(selection.files)) {
    throw new UserError(
      "تعذر اختيار الملفات: نتيجة مرحلة الاختيار غير صالحة."
    );
  }

  const chosen = selection.files;

  stage(
    "read",
    chosen.length
      ? "جارٍ قراءة " + chosen.length + " ملف…"
      : "لا حاجة لقراءة ملفات موجودة لهذا الطلب."
  );

  const files = await readFiles(env, encodedRepo, chosen);

  const existingPaths = (scan.snapshot?.tree?.tree || [])
    .filter((item) => item.type === "blob")
    .map((item) => item.path);

  stage("generate", "جارٍ تحليل الطلب وتوليد النتيجة…");

  const outcome = await generateChanges(env, {
    task: readOnly ? task + READ_ONLY_NOTE : task,
    history,
    files,
    existingPaths,
    skillsContext: selection.skillsContext || ""
  });

  // طلب قراءة فقط: لا فرع ولا PR مهما اقترح النموذج.
  if (readOnly || outcome.changed.length === 0) {
    return {
      ok: true,
      noChanges: true,
      summary: outcome.summary || "لم تتطلب المهمة أي تعديل على الملفات.",
      files: []
    };
  }

  if (!io.alive()) {
    throw new UserError(
      "انقطع اتصال المتصفح قبل إنشاء الفرع، لذلك لم يُنشأ شيء. أعد المحاولة."
    );
  }

  stage("publish", "جارٍ إنشاء الفرع وPull Request…");

  const published = await publishChanges(env, {
    encodedRepo,
    scan,
    summary: outcome.summary || "تعديلات Forion Agent",
    changed: outcome.changed
  });

  return {
    ok: true,
    noChanges: false,
    summary: outcome.summary || published.oneLine,
    branch: published.branch,
    files: outcome.changed.map((file) => file.path),
    url: published.url,
    autoMerge: published.autoMerge
  };
}
