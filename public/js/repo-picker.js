import { $, h } from "./dom.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { store } from "./storage.js";
import { toast } from "./toast.js";

export function renderRepoButton() {
  const repo = state.repos.find(item => item.full_name === state.repo);
  const badge = $("repoVis");

  $("repoName").textContent = state.repo || "اختر مستودعًا";
  badge.hidden = !repo;

  if (repo) {
    badge.textContent = repo.private ? "خاص" : "عام";
    badge.className = "badge" + (repo.private ? " private" : "");
  }
}

// يستعيد آخر مستودع اختاره المستخدم إن كان ما زال متاحًا.
// لا يختار مستودعًا تلقائيًا: التعديلات تُنشأ على مستودع حقيقي، فيجب أن يكون الاختيار صريحًا.
export function setRepos(repos) {
  state.repos = repos;

  const saved = store.local.get("repo");
  const keep = [state.repo, saved].find(name => name && repos.some(item => item.full_name === name));
  state.repo = keep || "";

  renderRepoButton();
}

function choose(name) {
  const changed = name !== state.repo;

  state.repo = name;
  store.local.set("repo", name);
  renderRepoButton();
  $("repoDialog").close();

  if (changed && state.history.length) {
    state.history = [];
    toast("تغيّر المستودع: سيُعامل الطلب التالي كسياق جديد.", "info", 3800);
  }
}

function renderList(query) {
  const needle = query.trim().toLowerCase();
  const items = state.repos.filter(item => item.full_name.toLowerCase().includes(needle));

  $("repoList").replaceChildren(...items.map(item => {
    const active = item.full_name === state.repo;

    return h("li", {},
      h("button", {
        type: "button",
        class: "repo-item" + (active ? " active" : ""),
        "aria-current": active ? "true" : false,
        onclick: () => choose(item.full_name)
      },
      h("span", { class: "repo-item-name", text: item.full_name }),
      h("span", { class: "badge" + (item.private ? " private" : ""), text: item.private ? "خاص" : "عام" }),
      active ? icon("check") : null)
    );
  }));

  $("repoEmpty").hidden = items.length > 0;
}

export function openRepoPicker() {
  const dialog = $("repoDialog");

  $("repoSearch").value = "";
  renderList("");
  if (!dialog.open) dialog.showModal();
  $("repoSearch").focus();
}

export function initRepoPicker() {
  const dialog = $("repoDialog");

  $("repoBtn").addEventListener("click", openRepoPicker);
  $("repoClose").addEventListener("click", () => dialog.close());
  $("repoSearch").addEventListener("input", event => renderList(event.target.value));
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
}
