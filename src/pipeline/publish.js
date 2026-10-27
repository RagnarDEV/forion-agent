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

// ينشئ commit وفرعًا مستقلًا وPull Request.
// الدمج التلقائي اختياري ويُفعَّل فقط عند AUTO_MERGE="true".
export async function publishChanges(env, { encodedRepo, scan, summary, changed }) {
  const { base, snapshot } = scan;

  if (!Array.isArray(changed) || changed.length === 0) {
    throw new UserError("لا توجد تغييرات صالحة للنشر.");
  }

  const latest = await github(env, "/repos/" + encodedRepo + "/git/ref/heads/" + encodeRef(base));
  if (latest.object.sha !== snapshot.refSha) {
    throw new UserError("تغيّر الفرع الأساسي أثناء التحليل. أعد المحاولة على أحدث نسخة.");
  }

  const oneLine = String(summary || "تعديلات Forion Agent")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

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

  const autoMergeOn = isAutoMergeEnabled(env);

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
          "\n\n## الملفات المعدلة\n" +
          changed.map(file => "- `" + file.path + "`").join("\n") +
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

  return { branch, url: pr.html_url, oneLine, autoMerge };
}
