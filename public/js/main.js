import { $, swap, setBanner, setLoading } from "./dom.js";
import { hydrateIcons, ICONS } from "./icons.js";
import { state } from "./state.js";
import { store } from "./storage.js";
import { apiGet, runTask } from "./api.js";
import { toast } from "./toast.js";
import { addMessage, createProgress, renderWelcome, initChatScroll, showResult, showFailure } from "./chat.js";
import { initRepoPicker, setRepos, openRepoPicker } from "./repo-picker.js";

// يجب أن يطابق LIMITS.maxTaskChars في src/config.js (الخادم يرفض ما هو أطول).
const MAX_CHARS = 50000;
const COUNT_FROM = 40000;
let draftTimer = 0;

function autosize() {
  const task = $("task");
  task.style.height = "auto";
  task.style.height = Math.min(task.scrollHeight, Math.round(window.innerHeight * 0.36)) + "px";
}

function updateCount() {
  const length = $("task").value.length;
  const counter = $("count");
  counter.hidden = length < COUNT_FROM;
  counter.textContent = length + " / " + MAX_CHARS;
}

function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const value = $("task").value;
    if (value) store.session.set("draft", value);
    else store.session.remove("draft");
  }, 300);
}

function setComposer(text) {
  $("task").value = text;
  autosize();
  updateCount();
  saveDraft();
  $("task").focus();
}

function showConnection(count) {
  $("conn").hidden = false;
  $("conn").classList.remove("offline");
  $("connText").textContent = count + " مستودع";
  $("connModel").textContent = (state.model || "").split("/").pop();
}

// تنبيه صريح عندما يكون الدمج التلقائي مفعّلًا حتى لا يُفاجَأ المستخدم.
function renderMergeNote() {
  const note = $("mergeNote");
  note.hidden = !state.autoMerge;
  note.textContent = state.autoMerge
    ? "الدمج التلقائي مفعّل: يطلب الوكيل من GitHub دمج الـ Pull Request تلقائيًا عند نجاح الفحوصات المطلوبة."
    : "";
}

function setOnline(online) {
  if (!state.token) return;
  $("conn").classList.toggle("offline", !online);
  $("connText").textContent = online ? state.repos.length + " مستودع" : "غير متصل";
  if (online) toast("عاد الاتصال بالإنترنت.", "ok", 2500);
  else toast("أنت غير متصل بالإنترنت.", "error", 4000);
}

async function loadRepos() {
  const data = await apiGet("/api/repos");
  const repos = Array.isArray(data.repos) ? data.repos : [];
  if (!repos.length) throw new Error("لا توجد مستودعات بصلاحية الكتابة لهذا الرمز.");

  state.model = typeof data.model === "string" ? data.model : "";
  state.autoMerge = data.autoMerge === true;
  setRepos(repos);
  renderMergeNote();
  return repos.length;
}

async function connect() {
  const value = $("token").value.trim();
  if (!value) {
    setBanner($("status"), "أدخل رمز الإدارة أولًا.", "error");
    $("token").focus();
    return;
  }

  state.token = value;
  setBanner($("status"), "");
  setLoading($("connect"), true, "جارٍ الاتصال…");

  try {
    const count = await loadRepos();
    renderWelcome(setComposer);
    await swap($("login"), $("workspace"));
    $("logout").hidden = false;
    showConnection(count);

    const draft = store.session.get("draft");
    if (draft) setComposer(draft);

    toast("تم تحميل " + count + " مستودع.", "ok", 2500);
    $("task").focus();
  } catch (error) {
    state.token = "";
    setBanner($("status"), String((error && error.message) || error), "error");
  } finally {
    setLoading($("connect"), false);
  }
}

async function sendMessage() {
  if (state.busy) return;

  const task = $("task").value.trim();
  if (!state.repo) {
    toast("اختر مستودعًا أولًا.", "error");
    openRepoPicker();
    return;
  }
  if (!task) return;
  if (task.length > MAX_CHARS) {
    toast("الرسالة أطول من الحد المسموح (" + MAX_CHARS + " حرف).", "error", 4000);
    return;
  }

  state.busy = true;
  state.lastTask = task;
  setLoading($("send"), true, "جارٍ التنفيذ");

  $("task").value = "";
  autosize();
  updateCount();
  store.session.remove("draft");

  addMessage("user", task);
  const prior = state.history.slice(-6);
  state.history.push({ role: "user", content: task });

  const progress = createProgress();
  progress.update("scan");

  try {
    const result = await runTask(state.repo, task, prior, event => {
      if (event.type === "stage") progress.update(event.stage, event.message);
    });
    progress.stop();
    showResult(result);
  } catch (error) {
    progress.stop();
    state.history.pop();
    showFailure(String((error && error.message) || error), () => setComposer(state.lastTask));
  } finally {
    state.busy = false;
    setLoading($("send"), false);
    $("task").focus();
  }
}

async function logout() {
  if (state.busy) return;

  state.token = "";
  state.history = [];
  state.repos = [];
  state.repo = "";
  state.autoMerge = false;

  $("token").value = "";
  $("token").type = "password";
  $("toggleToken").firstElementChild.innerHTML = ICONS.eye;
  $("logout").hidden = true;
  $("conn").hidden = true;
  renderMergeNote();
  setBanner($("status"), "");

  await swap($("workspace"), $("login"));
  $("token").focus();
}

function initEvents() {
  // يمنع المتصفح من تجاوز الحد (العداد يظهر قرب الحد؛ والخادم يتحقق أيضًا).
  $("task").maxLength = MAX_CHARS;

  $("connect").addEventListener("click", connect);
  $("token").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      connect();
    }
  });

  $("toggleToken").addEventListener("click", () => {
    const input = $("token");
    const show = input.type === "password";

    input.type = show ? "text" : "password";
    $("toggleToken").setAttribute("aria-pressed", String(show));
    $("toggleToken").setAttribute("aria-label", show ? "إخفاء الرمز" : "إظهار الرمز");
    $("toggleToken").firstElementChild.innerHTML = ICONS[show ? "eyeOff" : "eye"];
  });

  $("refresh").addEventListener("click", async () => {
    const button = $("refresh");
    button.disabled = true;
    try {
      const count = await loadRepos();
      showConnection(count);
      toast("تم تحديث القائمة (" + count + " مستودع).", "ok", 2500);
    } catch (error) {
      toast(String((error && error.message) || error), "error", 5000);
    } finally {
      button.disabled = false;
    }
  });

  $("send").addEventListener("click", sendMessage);
  $("task").addEventListener("input", () => {
    autosize();
    updateCount();
    saveDraft();
  });
  $("task").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });

  $("clear").addEventListener("click", () => {
    if (state.busy) return;
    state.history = [];
    renderWelcome(setComposer);
    toast("بدأت محادثة جديدة.", "info", 2000);
  });

  $("logout").addEventListener("click", logout);

  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));

  document.addEventListener("visibilitychange", () => {
    document.documentElement.toggleAttribute("data-paused", document.hidden);
  });

  // اختصار: "/" ينقل التركيز إلى منطقة الكتابة.
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if ($("workspace").hidden) return;

    const active = document.activeElement;
    const tag = active ? active.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    event.preventDefault();
    $("task").focus();
  });
}

hydrateIcons();
initRepoPicker();
initChatScroll();
initEvents();
