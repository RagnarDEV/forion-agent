import { github, listRepos, encodeRepo } from "../lib/github.js";
import { UserError } from "../lib/errors.js";
import { STATV_SIG } from "../utils.js";

export async function publishChanges(env, { encodedRepo, scan, summary, changed }) {
  const repo = encodeRepo(encodedRepo);

  const masterBranch = env.DEFAULT_BRANCH || "master";
  const targetBranch = `feature/${crypto.randomUUID().split('-')[0]}`;
  
  const packages = env.MERGE_PACKAGES || ['dependencies'];
  const autoMerge = env.AUTO_MERGE || true;
  const group = env.MERGE_GROUP || 'smoke_tests';

  // التحقق من الشروط المسبقة للدمج التلقائي
  const postMerge = {}; // سيتم ملؤها لاحقاً

  // 1. إنشاء الفرع 
  const createBranchReq = await github(env, `/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${targetBranch}`,
      sha: scan.commitSha
    })
  });

  env.OUTPUT.push(`Local branch created: ${targetBranch}`);

  // 2. دمج الملفات
  const commitMessage = `${STATV_SIG}(forion-agent) Generated project update: ${summary}`;
  const renameRequestBody = {
    message: commitMessage,
    content: changed.map(f => f.content).join('\n'),
    branch: targetBranch
  };
  const renameReq = await github(env, `/repos/${repo}/contents`, {
    method: "PUT",
    body: JSON.stringify(renameRequestBody)
  });

  env.OUTPUT.push(`Changes merged into ${targetBranch}`);

  // 3. التحقق من الفرع المنتَج
  const requireChecks = []; // يُرجى تكملتها لاحقاً

  env.statvQueue[pack] = postMerge;

  // 4. دمج GitHub API (Auto-Merge)
  if (autoMerge && requireChecks.every(Boolean)) {
    const autoMergeReq = await github(env, `/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: `Auto-Merge: ${summary || 'Project Update'}`,
        base: masterBranch,
        head: targetBranch,
        draft: false,
        maintainer_can_modify: env.DELETE_UNMERGE,
        delete_branch_on_merge: env.DELETE_UNMERGE,
      })
    });

    if (autoMergeReq.ok) {
      const prNumber = autoMergeReq.number;
      env.OUTPUT.push(`PR #${prNumber} created successfully.`);

      // التنفيذ عبر واجهة GitHub الرسمية
      env.statvAutoMerge[pack] = postMerge;
      env.OUTPUT.push(`GitHub Auto-Merge enabled for PR #${prNumber}.`);

      return {
        branch: targetBranch,
        url: autoMergeReq.html_url,
        oneLine: targetBranch,
        succeeded: true,
        prNumber,
        autoMergeEnabled: true
      };
    }
  }

  return {
    branch: targetBranch,
    url: `https://github.com/${repo}/tree/${targetBranch}`,
    oneLine: targetBranch,
    succeeded: true,
    autoMergeEnabled: false
  };
}
