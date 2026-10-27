
import { UserError } from "../lib/errors.js";
import { encodeRepo } from "../lib/github.js";
import { scanRepository } from "./scan.js";
import { selectFiles } from "./select.js";
import { readFiles } from "./read.js";
import { generateChanges } from "./generate.js";
import { publishChanges } from "./publish.js";

// خط المعالجة: فحص ← اختيار ← قراءة ← توليد ← نشر.
export async function runPipeline(env, input, io) {
  const { repo, task, history } = input;
  const encodedRepo = encodeRepo(repo);

  const stage = (name, message) =>
    io.emit({ type: "stage", stage: name, message });

  stage("scan", "جارٍ فحص بنية المستودع…");
  const scan = await scanRepository(env, repo, encodedRepo);

  stage("select", "جارٍ اختيار الملفات المناسبة…");

  // selectFiles تُرجع كائنًا يحتوي على الملفات وسياق المهارات.
  const selection = await selectFiles(env, {
    task,
    history,
    scan
  });

  if (
    !selection ||
    typeof selection !== "object" ||
    !Array.isArray(selection.files)
  ) {
    throw new UserError(
      "تعذر اختيار الملفات: النتيجة المعادة من مرحلة الاختيار غير صالحة."
    );
  }

  const chosen = selection.files;

  stage("read", "جارٍ قراءة " + chosen.length + " ملف…");

  // readFiles تتوقع مصفوفة الملفات، وليس كائن selection كاملًا.
  const files = await readFiles(env, encodedRepo, chosen);

  // جمع مسارات الملفات الموجودة فعلًا في المستودع.
  // هذا يمنع التعامل مع ملف موجود لم تتم قراءته كأنه ملف جديد.
  const existingPaths = (scan.snapshot.tree.tree || [])
    .filter(item => item.type === "blob")
    .map(item => item.path);

  stage("generate", "جارٍ تحليل الطلب وتوليد النتيجة…");

  const outcome = await generateChanges(env, {
    task,
    history,
    files,
    existingPaths
  });

  if (!outcome.changed.length) {
    return {
      ok: true,
      noChanges: true,
      summary:
        outcome.summary ||
        "لم يتطلب الطلب أي تعديل على الملفات.",
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
    summary: outcome.summary,
    changed: outcome.changed
  });

  return {
    ok: true,
    noChanges: false,
    summary: outcome.summary || published.oneLine,
    branch: published.branch,
    files: outcome.changed.map(file => file.path),
    url: published.url
  };
}
