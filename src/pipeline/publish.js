import { UserError, errorMessage } from "../lib/errors.js";
import { github, encodeRef } from "../lib/github.js";
import { isAutoMergeEnabled } from "../lib/flags.js";
import { cleanSecret } from "../lib/security.js";

const AUTO_MERGE_MUTATION = `
  mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
    enablePullRequestAutoMerge(input: {
      pullRequestId: $pullRequestId,
      mergeMethod: $mergeMethod
    }) {
      pullRequest {
        number
        url
        autoMergeRequest { enabledAt mergeMethod }
      }
    }
  }
`;

// يطلب من GitHub دمج الـ PR تلقائيًا (SQUASH) عند نجاح الفحوصات المطلوبة.
// يتطلب تفعيل "Allow auto-merge" في إعدادات المستودع.
async function enablePullRequestAutoMerge(env, pullRequestId) {
  const token = cleanSecret(env.GITHUB_TOKEN);
  if (!token) throw new UserError("إعداد GITHUB_TOKEN غير موجود.");

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
      "User-Agent": "forion-agent"
    },
    body: JSON.stringify({
      query: AUTO_MERGE_MUTATION,
      variables: { pullRequestId, mergeMethod: "SQUASH" }
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new UserError("أعاد GitHub استجابة غير صالحة عند تفعيل الدمج التلقائي.");
  }

  if (!response.ok || data.errors?.length) {
    const details = (data.errors || []).map(item => item.message).join("; ");
    throw new UserError("تعذر تفعيل الدمج التلقائي: " + (details || "HTTP " + response.status));
  }

  const result = data.data?.enablePullRequestAutoMerge?.pullRequest;
  if (!result?.autoMergeRequest) {
    throw new UserError("لم يؤكد GitHub تفعيل الدمج التلقائي.");
  }

  return {
    enabled: true,
    number: result.number,
    url: result.url,
    mergeMethod: result.autoMergeRequest.mergeMethod
  };
}

const touchesWorkflows = entries =>
  entries.some(entry => /(^|\/)\.github\/workflows\//i.test(entry.path));

// تعديل ملفات .github/workflows يحتاج صلاحية Workflows في GITHUB_TOKEN؛ نشرح ذلك بدل رسالة 403 غامضة.
function explainTreeError(error, entries) {
  if (error && error.fromGitHub && [403, 404, 422].includes(error.status) && touchesWorkflows(entries)) {
    return new UserError(
      "رفض GitHub تعديل ملفات .github/workflows. يحتاج GITHUB_TOKEN إلى صلاحية " +
      "Workflows (Read and write)، أو استثنِ هذه الملفات من الطلب.\n" + String(error.message).slice(0, 300)
    );
  }

  return error;
}

// يحوّل نتيجة التوليد إلى مدخلات شجرة git: حذف (sha=null) ونقل وتعديل/إنشاء.
function buildTreeEntries(snapshot, { changed, deleted, renamed }) {
  const existing = new Map(
    (snapshot.tree.tree || []).filter(item => item.type === "blob").map(item => [item.path, item])
  );
  const entries = new Map();

  for (const path of deleted) {
    entries.set(path, { path, mode: existing.get(path)?.mode || "100644", type: "blob", sha: null });
  }

  for (const { from, to } of renamed) {
    const source = existing.get(from);
    if (!source) throw new UserError("تعذر نقل الملف لأنه غير موجود في المستودع: " + from);

    const mode = source.mode || "100644";
    entries.set(from, { path: from, mode, type: "blob", sha: null });
    entries.set(to, { path: to, mode, type: "blob", sha: source.sha });
  }

  for (const file of changed) {
    entries.set(file.path, {
      path: file.path,
      mode: existing.get(file.path)?.mode || "100644",
      type: "blob",
      content: file.content
    });
  }

  return [...entries.values()];
}

const firstLine = (text, max) => String(text || "")
  .split("\n")[0]
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

// ينشئ commit وفرعًا مستقلًا وPull Request.
// الدمج التلقائي اختياري ويُفعَّل فقط عند AUTO_MERGE="true".
export async function publishChanges(env, { encodedRepo, scan, summary, changed = [], deleted = [], renamed = [] }) {
  const { base, snapshot } = scan;

  if (!changed.length && !deleted.length && !renamed.length) {
    throw new UserError("لا توجد تغييرات صالحة للنشر.");
  }

  const latest = await github(env, "/repos/" + encodedRepo + "/git/ref/heads/" + encodeRef(base));
  if (latest.object.sha !== snapshot.refSha) {
    throw new UserError("تغيّر الفرع الأساسي أثناء التحليل. أعد المحاولة على أحدث نسخة.");
  }

  const oneLine = firstLine(summary, 100) || "تعديلات Forion Agent";
  const entries = buildTreeEntries(snapshot, { changed, deleted, renamed });

  let tree;
  try {
    tree = await github(env, "/repos/" + encodedRepo + "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: snapshot.treeSha, tree: entries })
    });
  } catch (error) {
    throw explainTreeError(error, entries);
  }

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

  const autoMergeOn = isAutoMergeEnabled(env);
  const list = (title, items) => items.length ? "\n\n## " + title + "\n" + items.join("\n") : "";

  let pr;
  try {
    pr = await github(env, "/repos/" + encodedRepo + "/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: "Forion Agent: " + oneLine,
        head: branch,
        base,
        body:
          "## ملخص التعديلات\n" + String(summary || oneLine).slice(0, 4000) +
          list("الملفات المعدلة أو الجديدة", changed.map(file => "- `" + file.path + "`")) +
          list("الملفات المحذوفة", deleted.map(path => "- `" + path + "`")) +
          list("الملفات المنقولة", renamed.map(item => "- `" + item.from + "` ← `" + item.to + "`")) +
          "\n\n---\n" +
          (autoMergeOn
            ? "سيطلب الوكيل تفعيل الدمج التلقائي عبر GitHub (يُدمج عند نجاح الفحوصات المطلوبة)."
            : "الدمج التلقائي معطّل؛ راجع التغييرات وادمجها يدويًا.")
      })
    });
  } catch (error) {
    throw new UserError(
      "أُنشئ الفرع " + branch + " لكن تعذر إنشاء Pull Request: " + errorMessage(error)
    );
  }

  let autoMerge = { enabled: false, reason: "الدمج التلقائي غير مفعّل في إعدادات الوكيل." };

  if (autoMergeOn) {
    if (!pr.node_id) {
      autoMerge = { enabled: false, reason: "لم يُرجع GitHub معرّف Pull Request." };
    } else {
      try {
        autoMerge = await enablePullRequestAutoMerge(env, pr.node_id);
      } catch (error) {
        // يبقى الـ PR موجودًا للمراجعة اليدوية حتى لو فشل تفعيل الدمج التلقائي.
        autoMerge = { enabled: false, reason: errorMessage(error) };
      }
    }
  }

  return {
    branch,
    url: pr.html_url,
    number: pr.number,
    oneLine,
    autoMerge,
    headSha: commit.sha,
    treeSha: tree.sha
  };
}

// يضيف commit جديدًا فوق فرع قائم (إصلاحات ما بعد فشل الفحوصات).
export async function commitToBranch(env, encodedRepo, { branch, parentSha, parentTreeSha, changed = [], deleted = [], message }) {
  const entries = [
    ...deleted.map(path => ({ path, mode: "100644", type: "blob", sha: null })),
    ...changed.map(file => ({ path: file.path, mode: "100644", type: "blob", content: file.content }))
  ];

  if (!entries.length) throw new UserError("لا توجد تغييرات لإضافتها إلى الفرع.");

  let tree;
  try {
    tree = await github(env, "/repos/" + encodedRepo + "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: parentTreeSha, tree: entries })
    });
  } catch (error) {
    throw explainTreeError(error, entries);
  }

  const commit = await github(env, "/repos/" + encodedRepo + "/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] })
  });

  await github(env, "/repos/" + encodedRepo + "/git/refs/heads/" + encodeRef(branch), {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return { sha: commit.sha, treeSha: tree.sha };
}

// تعليق على الـ PR (best effort: فشله لا يُفشل المهمة).
export async function commentOnPullRequest(env, encodedRepo, number, body) {
  if (!number) return false;

  try {
    await github(env, "/repos/" + encodedRepo + "/issues/" + number + "/comments", {
      method: "POST",
      body: JSON.stringify({ body })
    });
    return true;
  } catch {
    return false;
  }
}
