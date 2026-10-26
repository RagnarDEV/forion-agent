import { UserError, errorMessage } from "../lib/errors.js";
import { github } from "../lib/github.js";

// ينشئ commit وفرعًا مستقلًا وPull Request. لا يتم أي دمج تلقائي.
export async function publishChanges(env, { encodedRepo, scan, summary, changed }) {
  const { base, snapshot } = scan;

  const latest = await github(env, "/repos/" + encodedRepo +
    "/git/ref/heads/" + encodeURIComponent(base));
  if (latest.object.sha !== snapshot.refSha) {
    throw new UserError("تغيّر الفرع الأساسي أثناء التحليل. أعد المحاولة على أحدث نسخة.");
  }

  const oneLine = summary.replace(/\s+/g, " ").trim() || "تعديلات Forion Agent";

  const tree = await github(env, "/repos/" + encodedRepo + "/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: snapshot.treeSha,
      tree: changed.map(file => ({
        path: file.path,
        mode: "100644",
        type: "blob",
        content: file.content
      }))
    })
  });

  const commit = await github(env, "/repos/" + encodedRepo + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: "Forion Agent: " + oneLine.slice(0, 72),
      tree: tree.sha,
      parents: [snapshot.commitSha]
    })
  });

  const branch = "forion-agent-" +
    new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) +
    "-" + crypto.randomUUID().slice(0, 8);

  await github(env, "/repos/" + encodedRepo + "/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: "refs/heads/" + branch, sha: commit.sha })
  });

  let pr;
  try {
    pr = await github(env, "/repos/" + encodedRepo + "/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: "Forion Agent: " + oneLine.slice(0, 120),
        head: branch,
        base,
        body: "## ملخص التعديلات\n" + summary.slice(0, 4000) +
          "\n\n## الملفات\n" +
          changed.map(file => "- `" + file.path + "`").join("\n") +
          "\n\n---\nراجع التغييرات وشغّل الاختبارات قبل الدمج. لم يتم الدمج تلقائيًا."
      })
    });
  } catch (error) {
    throw new UserError("تم إنشاء الفرع " + branch +
      " لكن تعذر فتح Pull Request: " + errorMessage(error));
  }

  return { branch, url: pr.html_url, oneLine };
}
