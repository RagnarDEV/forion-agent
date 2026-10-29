import { UserError } from "../lib/errors.js";
import { github } from "../lib/github.js";
import { isSafeTextPath } from "../lib/paths.js";
import { fetchBlobText } from "../pipeline/read.js";

// أدوات الاستكشاف التي يستدعيها النموذج. نتائجها نصوص قصيرة وتُعدّ بيانات غير موثوقة.
// add_comment وحدها تكتب على GitHub، ولا تُتاح إلا عندما يطلب المستخدم تعليقًا صراحةً.

export const TOOL_SPECS = Object.freeze([
  { name: "search_code", args: "{\"query\":\"text\"}", doc: "Search this repository's code (top 10 matches with paths)." },
  { name: "read_file", args: "{\"path\":\"src/a.js\",\"start\":1,\"end\":200}", doc: "Read a text file, optionally a line range. Output is truncated." },
  { name: "list_dir", args: "{\"path\":\"src\"}", doc: "List the entries of a directory (use an empty string for the root)." },
  { name: "list_issues", args: "{\"state\":\"open\"}", doc: "List issues (state: open, closed or all)." },
  { name: "get_issue", args: "{\"number\":1}", doc: "Read an issue with its latest comments." },
  { name: "get_pull_request", args: "{\"number\":1}", doc: "Read a pull request: description, changed files and comments." },
  { name: "add_comment", args: "{\"number\":1,\"body\":\"text\"}", doc: "Post a comment on an issue or pull request. Only when the user explicitly asked for a comment.", write: true }
]);

const MAX_RESULT = 6000;

const cap = (text, max = MAX_RESULT) => {
  const value = String(text ?? "");
  return value.length > max ? value.slice(0, max) + "\n...(truncated)" : value;
};

function numberArg(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 9999999) {
    throw new UserError("الوسيط " + name + " يجب أن يكون رقمًا صحيحًا موجبًا.");
  }
  return number;
}

function blobsOf(ctx) {
  if (!ctx.blobs) {
    const entries = (ctx.scan.snapshot?.tree?.tree || []).filter(item => item.type === "blob");
    ctx.blobs = new Map(entries.map(item => [item.path, item]));
  }
  return ctx.blobs;
}

async function searchCode(input, ctx) {
  const query = String(input.query || "").trim().slice(0, 200);
  if (!query) throw new UserError("الوسيط query مطلوب.");

  try {
    const data = await github(
      ctx.env,
      "/search/code?per_page=10&q=" + encodeURIComponent(query + " repo:" + ctx.repo),
      { headers: { Accept: "application/vnd.github.text-match+json" } }
    );
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return "No matches.";

    return cap(items.map(item => {
      const fragment = item.text_matches && item.text_matches[0] && item.text_matches[0].fragment;
      return "- " + item.path + (fragment ? ": " + String(fragment).replace(/\s+/g, " ").slice(0, 160) : "");
    }).join("\n"));
  } catch (error) {
    return "Search failed: " + String(error.message || error).slice(0, 200);
  }
}

async function readFile(input, ctx) {
  const path = String(input.path || "");
  const entry = blobsOf(ctx).get(path);

  if (!entry || !isSafeTextPath(path)) return "File not found or not readable: " + path.slice(0, 200);

  const text = await fetchBlobText(ctx.env, ctx.encodedRepo, entry.sha, path);
  const lines = text.split("\n");
  const start = Math.max(1, Math.floor(Number(input.start)) || 1);
  const end = Math.min(lines.length, Math.floor(Number(input.end)) || start + 399);
  const body = lines.slice(start - 1, end).map((line, index) => (start + index) + ": " + line).join("\n");

  return cap("FILE " + path + " (lines " + start + "-" + end + " of " + lines.length + ")\n" + body, 9000);
}

function listDir(input, ctx) {
  const prefix = String(input.path || "").replace(/^\/+|\/+$/g, "");
  const base = prefix ? prefix + "/" : "";
  const names = new Set();

  for (const path of blobsOf(ctx).keys()) {
    if (!path.startsWith(base)) continue;

    const rest = path.slice(base.length);
    const slash = rest.indexOf("/");
    names.add(slash >= 0 ? rest.slice(0, slash) + "/" : rest);
  }

  if (!names.size) return "Empty or unknown directory.";
  return cap([...names].sort().slice(0, 120).join("\n"));
}

async function listIssues(input, ctx) {
  const state = ["open", "closed", "all"].includes(input.state) ? input.state : "open";
  const data = await github(ctx.env, "/repos/" + ctx.encodedRepo + "/issues?state=" + state + "&per_page=25");
  const items = (Array.isArray(data) ? data : []).filter(item => !item.pull_request);

  if (!items.length) return "No issues.";

  return cap(items.map(item =>
    "#" + item.number + " [" + item.state + "] " + item.title +
    (item.labels && item.labels.length ? " (" + item.labels.map(label => label.name).join(", ") + ")" : "")
  ).join("\n"));
}

async function recentComments(ctx, number) {
  try {
    const comments = await github(ctx.env, "/repos/" + ctx.encodedRepo + "/issues/" + number + "/comments?per_page=5");
    return (Array.isArray(comments) ? comments : [])
      .map(comment => "--- " + (comment.user && comment.user.login) + ": " + String(comment.body || "").slice(0, 800))
      .join("\n");
  } catch {
    return "";
  }
}

async function getIssue(input, ctx) {
  const number = numberArg(input.number, "number");
  const issue = await github(ctx.env, "/repos/" + ctx.encodedRepo + "/issues/" + number);

  return cap(
    "#" + number + " " + issue.title + " [" + issue.state + "]\n" +
    String(issue.body || "").slice(0, 4000) + "\n" +
    await recentComments(ctx, number)
  );
}

async function getPullRequest(input, ctx) {
  const number = numberArg(input.number, "number");
  const pr = await github(ctx.env, "/repos/" + ctx.encodedRepo + "/pulls/" + number);
  let files = [];

  try {
    const list = await github(ctx.env, "/repos/" + ctx.encodedRepo + "/pulls/" + number + "/files?per_page=40");
    files = (Array.isArray(list) ? list : []).map(file => "  " + file.status + " " + file.filename);
  } catch {}

  return cap(
    "PR #" + number + " " + pr.title + " [" + pr.state + "] " +
    (pr.head && pr.head.ref) + " -> " + (pr.base && pr.base.ref) + "\n" +
    String(pr.body || "").slice(0, 3000) + "\nFILES:\n" + files.join("\n") + "\n" +
    await recentComments(ctx, number)
  );
}

async function addComment(input, ctx) {
  if (!ctx.allowComment) throw new UserError("إضافة التعليقات غير مسموحة لهذه المهمة.");
  if (ctx.commentsLeft <= 0) throw new UserError("تم الوصول إلى الحد الأقصى للتعليقات في هذه المهمة.");

  const number = numberArg(input.number, "number");
  const body = String(input.body || "").trim().slice(0, 4000);
  if (!body) throw new UserError("الوسيط body مطلوب.");

  await github(ctx.env, "/repos/" + ctx.encodedRepo + "/issues/" + number + "/comments", {
    method: "POST",
    body: JSON.stringify({ body: body + "\n\n— Forion Agent" })
  });

  ctx.commentsLeft--;
  return "Comment posted on #" + number + ".";
}

// ctx: { env, repo, encodedRepo, scan, allowComment, commentsLeft }
export async function runTool(name, args, ctx) {
  const input = args && typeof args === "object" && !Array.isArray(args) ? args : {};

  switch (name) {
    case "search_code": return searchCode(input, ctx);
    case "read_file": return readFile(input, ctx);
    case "list_dir": return listDir(input, ctx);
    case "list_issues": return listIssues(input, ctx);
    case "get_issue": return getIssue(input, ctx);
    case "get_pull_request": return getPullRequest(input, ctx);
    case "add_comment": return addComment(input, ctx);
    default: throw new UserError("أداة غير معروفة: " + String(name).slice(0, 40));
  }
}
