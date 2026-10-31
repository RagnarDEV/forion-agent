import { GITHUB_API } from "../config.js";
import { UserError } from "./errors.js";
import { cleanSecret } from "./security.js";

const encodeSegments = value => value.split("/").map(encodeURIComponent).join("/");

export const encodeRepo = encodeSegments;

// أسماء الفروع قد تحتوي "/" (مثل feature/x) ويجب أن تبقى كما هي في مسار المرجع.
export const encodeRef = encodeSegments;

function authHeaders(env, extra = {}) {
  return {
    "Authorization": "Bearer " + cleanSecret(env.GITHUB_TOKEN),
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub يرفض (403) أي طلب بلا User-Agent.
    "User-Agent": "forion-agent",
    ...extra
  };
}

function githubError(response, detail) {
  const error = new Error("GitHub (" + response.status + "): " + detail);
  error.fromGitHub = true;
  error.status = response.status;
  return error;
}

// كل استدعاء يُحتسب من ميزانية الطلب (env.budget) قبل تنفيذه.
export async function github(env, path, options = {}) {
  if (env.budget) env.budget.spend();

  const response = await fetch(GITHUB_API + path, {
    ...options,
    headers: authHeaders(env, {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    })
  });

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}

  if (!response.ok) {
    const detail = (data && data.message) ||
      raw.replace(/\s+/g, " ").trim().slice(0, 200) ||
      "طلب GitHub فشل";
    throw githubError(response, detail);
  }

  return data;
}

// يقرأ استجابة نصية (مثل سجلات GitHub Actions) ويُبقي آخر maxChars حرف منها.
// ملاحظة: متابعة إعادة التوجيه إلى مخزن السجلات قد تُحتسب استدعاءً إضافيًا، فنحتسب اثنين.
export async function githubText(env, path, maxChars = 200000) {
  if (env.budget) env.budget.spend(2);

  const response = await fetch(GITHUB_API + path, {
    headers: authHeaders(env),
    redirect: "follow"
  });

  if (!response.ok) throw githubError(response, "تعذرت قراءة النص");

  const text = await response.text();
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

export async function listRepos(env) {
  const all = [];

  for (let page = 1; page <= 10; page++) {
    const batch = await github(env,
      "/user/repos?per_page=100&page=" + page +
      "&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member");

    if (!Array.isArray(batch)) {
      throw new UserError("استجابة قائمة المستودعات غير صالحة.");
    }

    all.push(...batch);
    if (batch.length < 100) break;
  }

  return all
    .filter(repo => repo && repo.full_name && repo.permissions &&
      (repo.permissions.push || repo.permissions.admin))
    .map(repo => ({
      full_name: repo.full_name,
      private: Boolean(repo.private),
      default_branch: repo.default_branch
    }));
}

export async function getTree(env, repo, branch) {
  const encodedRepo = encodeRepo(repo);
  const ref = await github(env, "/repos/" + encodedRepo +
    "/git/ref/heads/" + encodeRef(branch));
  const commit = await github(env, "/repos/" + encodedRepo +
    "/git/commits/" + ref.object.sha);
  const tree = await github(env, "/repos/" + encodedRepo +
    "/git/trees/" + commit.tree.sha + "?recursive=1");

  if (tree.truncated) {
    throw new UserError(
      "المستودع كبير جدًا: أعاد GitHub شجرة غير مكتملة، ولا يمكن ضمان تعديل آمن عليه."
    );
  }

  return {
    refSha: ref.object.sha,
    commitSha: commit.sha,
    treeSha: commit.tree.sha,
    tree
  };
}
