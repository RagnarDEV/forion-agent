import { UserError } from "../lib/errors.js";
import { encodeRepo } from "../lib/github.js";
import { scanRepository } from "./scan.js";
import { selectFiles } from "./select.js";
import { readFiles } from "./read.js";
import { generateChanges } from "./generate.js";
import { publishChanges } from "./publish.js";

export async function runPipeline(env, input, io) {
  const { repo, task, history } = input;
  const encodedRepo = encodeRepo(repo);

  const stage = (name, message) => {
    io.emit({
      type: "stage",
      stage: name,
      message
    });
  };

  // 1. فحص المستودع
  stage("scan", "جارٍ فحص بنية المستودع…");

  const scan = await scanRepository(
    env,
    repo,
    encodedRepo
  );

  // 2. اختيار الملفات
  stage("select", "جارٍ اختيار الملفات المناسبة…");

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
      "تعذر اختيار الملفات: نتيجة مرحلة الاختيار غير صالحة."
    );
  }

  const chosen = selection.files;

  if (chosen.length === 0) {
    return {
      ok: true,
      noChanges: true,
      summary: "لم يتم العثور على ملفات مناسبة للمهمة.",
      files: []
    };
  }

  // 3. قراءة الملفات المختارة
  stage(
    "read",
    "جارٍ قراءة " + chosen.length + " ملف…"
  );

  const files = await readFiles(
    env,
    encodedRepo,
    chosen
  );

  // المسارات الموجودة فعليًا في المستودع
  const tree = scan.snapshot?.tree?.tree || [];

  const existingPaths = tree
    .filter(item => item.type === "blob")
    .map(item => item.path);

  // 4. توليد التغييرات
  stage("generate", "جارٍ تحليل الطلب وتوليد التعديلات…");

  const outcome = await generateChanges(env, {
    task,
    history,
    files,
    existingPaths
  });

  if (
    !outcome ||
    !Array.isArray(outcome.changed)
  ) {
    throw new UserError(
      "أعادت مرحلة التوليد نتيجة غير صالحة."
    );
  }

  if (outcome.changed.length === 0) {
    return {
      ok: true,
      noChanges: true,
      summary:
        outcome.summary ||
        "لم تتطلب المهمة أي تعديل على الملفات.",
      files: []
    };
  }

  if (!io.alive()) {
    throw new UserError(
      "انقطع اتصال المتصفح قبل النشر. أعد المحاولة."
    );
  }

  // 5. إنشاء الفرع وPull Request
  stage(
    "publish",
    "جارٍ إنشاء الفرع وPull Request…"
  );

  const published = await publishChanges(env, {
    encodedRepo,
    scan,
    summary: outcome.summary || "تعديلات Forion Agent",
    changed: outcome.changed
  });

  return {
    ok: true,
    noChanges: false,
    summary:
      outcome.summary ||
      published.oneLine ||
      "اكتملت التعديلات.",
    branch: published.branch,
    files: outcome.changed.map(file => file.path),
    url: published.url,
    autoMerge: published.autoMerge || null
  };
}
