
import { UserError, errorMessage } from "../lib/errors.js";
import { github } from "../lib/github.js";

function isAutoMergeEnabled(env) {
  return String(env.AUTO_MERGE || "")
    .trim()
    .toLowerCase() === "true" &&
    typeof env.ADMIN_TOKEN === "string" &&
    env.ADMIN_TOKEN.length > 0;
}

async function enablePullRequestAutoMerge(env, pullRequestId) {
  const token = String(env.GITHUB_TOKEN || "").trim();

  if (!token) {
    throw new UserError("إعداد GITHUB_TOKEN غير موجود.");
  }

  const query = `
    mutation EnableAutoMerge(
      $pullRequestId: ID!,
      $mergeMethod: PullRequestMergeMethod!
    ) {
      enablePullRequestAutoMerge(input: {
        pullRequestId: $pullRequestId,
        mergeMethod: $mergeMethod
      }) {
        pullRequest {
          number
          url
          autoMergeRequest {
            enabledAt
            mergeMethod
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "User-Agent": "forion-agent"
    },
    body: JSON.stringify({
      query,
      variables: {
        pullRequestId,
        mergeMethod: "SQUASH"
      }
    })
  });

  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new UserError(
      "أعاد GitHub استجابة غير صالحة عند تفعيل الدمج التلقائي."
    );
  }

  if (!response.ok || data.errors?.length) {
    const details = (data.errors || [])
      .map(item => item.message)
      .join("; ");

    throw new UserError(
      "تعذر تفعيل الدمج التلقائي: " +
      (details || "HTTP " + response.status)
    );
  }

  const result =
    data.data?.enablePullRequestAutoMerge?.pullRequest;

  if (!result?.autoMergeRequest) {
    throw new UserError(
      "لم يؤكد GitHub تفعيل الدمج التلقائي."
    );
  }

  return {
    enabled: true,
    number: result.number,
    url: result.url,
    mergeMethod: result.autoMergeRequest.mergeMethod
  };
}

export async function publishChanges(
  env,
  { encodedRepo, scan, summary, changed, userInitiated } = {}
) {
  const { base, snapshot } = scan;

  if (!Array.isArray(changed) || changed.length === 0) {
    throw new UserError("لا توجد تغييرات صالحة للنشر.");
  }

  // التحقق من أن الفرع الأساسي لم يتغير أثناء عمل الوكيل.
  const latest = await github(
    env,
    "/repos/" + encodedRepo +
      "/git/ref/heads/" + encodeURIComponent(base)
  );

  if (latest.object.sha !== snapshot.refSha) {
    throw new UserError(
      "تغيّر الفرع الأساسي أثناء التحليل. أعد المحاولة."
    );
  }

  const oneLine = String(summary || "تعديلات Forion Agent")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  // إنشاء شجرة الملفات المعدلة.
  const tree = await github(
    env,
    "/repos/" + encodedRepo + "/git/trees",
    {
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
    }
  );

  // إنشاء commit جديد.
  const commit = await github(
    env,
    "/repos/" + encodedRepo + "/git/commits",
    {
      method: "POST",
      body: JSON.stringify({
        message: "Forion Agent: " + oneLine.slice(0, 72),
        tree: tree.sha,
        parents: [snapshot.commitSha]
      })
    }
  );

  // إنشاء فرع مستقل للتغييرات.
  const branch =
    "forion-agent-" +
    new Date().toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14) +
    "-" +
    crypto.randomUUID().slice(0, 8);

  await github(
    env,
    "/repos/" + encodedRepo + "/git/refs",
    {
      method: "POST",
      body: JSON.stringify({
        ref: "refs/heads/" + branch,
        sha: commit.sha
      })
    }
  );

  // إنشاء Pull Request.
  let pr;

  try {
    pr = await github(
      env,
      "/repos/" + encodedRepo + "/pulls",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Forion Agent: " + oneLine,
          head: branch,
          base,
          body:
            "## ملخص التعديلات\n" +
            String(summary || oneLine).slice(0, 4000) +
            "\n\n## الملفات المعدلة\n" +
            changed
              .map(file => "- `" + file.path + "`")
              .join("\n") +
            "\n\n---\n" +
            "\n**ملاحظة:** سيتم طلب الدمج التلقائي (Auto-Merge) في السيرفر إذا كان الإعداد مفعل وراسل الطلب مرتبطًا بخادم يمتلك `ADMIN_TOKEN`."
        })
      }
    );
  } catch (error) {
    throw new UserError(
      "أُنشئ الفرع " + branch +
      " لكن تعذر إنشاء Pull Request: " +
      errorMessage(error)
    );
  }

  // لا نفعّل الدمج التلقائي إلا إذا طُلب صراحةً من المستخدم وعُدل الإعداد على السيرفر.
  let autoMerge = {
    enabled: false,
    reason: "AUTO_MERGE غير مفعّل أو الطلب غير ملزم."
  };

  if (isAutoMergeEnabled(env) && userInitiated) {
    if (!pr.node_id) {
      autoMerge = {
        enabled: false,
        reason: "لم يُرجع GitHub معرّف Pull Request."
      };
    } else {
      try {
        autoMerge = await enablePullRequestAutoMerge(
          env,
          pr.node_id
        );
      } catch (error) {
        // يبقى طلب الدمج موجودًا حتى لو فشل تفعيل الدمج التلقائي.
        autoMerge = {
          enabled: false,
          reason: errorMessage(error)
        };
      }
    }
  }

  return {
    branch,
    url: pr.html_url,
    oneLine,
    autoMerge
  };
}
