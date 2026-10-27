// أدوات اختبار: GitHub وهمي (يستبدل fetch) ونموذج ذكاء اصطناعي وهمي.

const b64 = text => Buffer.from(text, "utf8").toString("base64");

export function makeRepo(files, { defaultBranch = "main", push = true } = {}) {
  const entries = Object.entries(files).map(([path, content], index) => ({
    path,
    content,
    sha: "blob" + index,
    size: Buffer.byteLength(content, "utf8")
  }));

  const calls = [];
  const state = { treeBody: null, prBody: null, graphql: null };

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method || "GET").toUpperCase();
    const path = decodeURIComponent(url.pathname);
    calls.push(method + " " + path);

    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (url.hostname === "api.github.com" && path === "/graphql") {
      state.graphql = JSON.parse(init.body);
      return reply(state.graphqlResponse || {
        data: { enablePullRequestAutoMerge: { pullRequest: {
          number: 7, url: "https://github.com/o/r/pull/7",
          autoMergeRequest: { enabledAt: "now", mergeMethod: "SQUASH" }
        } } }
      });
    }

    if (method === "GET" && path === "/repos/o/r") {
      return reply({ default_branch: defaultBranch, permissions: { push } });
    }
    if (method === "GET" && path === "/repos/o/r/git/ref/heads/" + defaultBranch) {
      return reply({ object: { sha: "c1" } });
    }
    if (method === "GET" && path === "/repos/o/r/git/commits/c1") {
      return reply({ sha: "c1", tree: { sha: "t1" } });
    }
    if (method === "GET" && path === "/repos/o/r/git/trees/t1") {
      return reply({
        truncated: false,
        tree: entries.map(e => ({ type: "blob", path: e.path, sha: e.sha, size: e.size }))
      });
    }

    const blob = path.match(/^\/repos\/o\/r\/git\/blobs\/(.+)$/);
    if (method === "GET" && blob) {
      const entry = entries.find(e => e.sha === blob[1]);
      return entry
        ? reply({ encoding: "base64", content: b64(entry.content) })
        : reply({ message: "Not Found" }, 404);
    }

    if (method === "POST" && path === "/repos/o/r/git/trees") {
      state.treeBody = JSON.parse(init.body);
      return reply({ sha: "t2" });
    }
    if (method === "POST" && path === "/repos/o/r/git/commits") return reply({ sha: "c2" });
    if (method === "POST" && path === "/repos/o/r/git/refs") return reply({});
    if (method === "POST" && path === "/repos/o/r/pulls") {
      state.prBody = JSON.parse(init.body);
      return reply({ html_url: "https://github.com/o/r/pull/7", node_id: "PR_7" });
    }

    return reply({ message: "Not Found: " + method + " " + path }, 404);
  };

  return { calls, state, restore: () => { globalThis.fetch = original; } };
}

// نموذج وهمي: يُرجع الردود بالترتيب، أو يستدعي دالة عند الطلب.
export function fakeAI(...responses) {
  const requests = [];
  let index = 0;

  return {
    requests,
    run: async (model, request) => {
      requests.push(request);
      const next = responses[Math.min(index++, responses.length - 1)];
      const value = typeof next === "function" ? next(request) : next;
      return { response: typeof value === "string" ? value : JSON.stringify(value) };
    }
  };
}

export function makeIO() {
  const events = [];
  return { events, emit: event => events.push(event), alive: () => true };
}

export const baseEnv = (ai, extra = {}) => ({
  GITHUB_TOKEN: "ghp_test",
  ADMIN_TOKEN: "admin-secret",
  MODEL: "test-model",
  AI: ai,
  ...extra
});
