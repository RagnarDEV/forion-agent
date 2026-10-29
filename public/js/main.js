import { $, swap, setBanner, setLoading } from "./dom.js";
import { hydrateIcons, ICONS } from "./icons.js";
import { state } from "./state.js";
import { store } from "./storage.js";
import { apiGet, runTask, AbortedError, AuthError } from "./api.js";
import { toast } from "./toast.js";
import { addMessage, createProgress, renderWelcome, initChatScroll, showResult, showFailure, showCancelled } from "./chat.js";
import { initRepoPicker, setRepos, openRepoPicker } from "./repo-picker.js";
import {
  loadPrefs, loadSkillState, skillsPayload,
  loadSavedToken, saveToken, forgetToken, normalizeToken
} from "./prefs.js";
import { initSettings } from "./settings.js";
import { initPwa } from "./pwa.js";

// الحد الأقصى يأتي من الخادم (LIMITS.maxTaskChars)، وهذه قيمة احتياطية قبل الاتصال.
const FALLBACK_MAX_CHARS = 50000;
const maxChars = () => (state.limits && state.limits.maxTaskChars) || FALLBACK_MAX_CHARS;
let draftTimer = 0;

function autosize() {
  const task = $("task");
  task.style.height = "auto";
  task.style.height = Math.min(task.scrollHeight, Math.round(window.innerHeight * 0.36)) + "px";
}

function updateCount() {
  const length = $("task").value.length;
  const limit = maxChars();
  const counter = $("count");

  counter.hidden = length < limit * 0.8;
  counter.textContent = length + " / " + limit;
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

function updateTokenMeta() {
  const length = normalizeToken($("token").value).length;
  $("tokenMeta").textContent = length ? length + " حرفًا" : "";
}

async function loadRepos() {
  const data = await apiGet("/api/repos");
  const repos = Array.isArray(data.repos) ? data.repos : [];
  if (!repos.length) throw new Error("لا توجد مستودعات بصلاحية الكتابة لهذا الرمز.");

  state.model = typeof data.model === "string" ? data.model : "";
  state.autoMerge = data.autoMerge === true;
  state.limits = data.limits || null;
  state.defaults = data.defaults || null;
  setRepos(repos);
  renderMergeNote();
  $("task").maxLength = maxChars();
  return repos.length;
}

// المهارات المدمجة من الخادم (للعرض في الإعدادات). فشلها لا يمنع الاتصال.
async function loadBuiltinSkills() {
  try {
    const data = await apiGet("/api/skills");
    state.builtinSkills = Array.isArray(data.skills) ? data.skills : [];
  } catch {
    state.builtinSkills = [];
  }
}

async function connect() {
  const value = normalizeToken($("token").value);
  if (!value) {
    setBanner($("status"), "أدخل رمز الإدارة أولًا.", "error");
    $("token").focus();
    return;
  }

  $("token").value = value;
  updateTokenMeta();
  state.token = value;
  setBanner($("status"), "");
  setLoading($("connect"), true, "جارٍ الاتصال…");

  try {
    const count = await loadRepos();
    await loadBuiltinSkills();
    saveToken(value, $("remember").checked);

    renderWelcome(setComposer);
    await swap($("login"), $("workspace"));
    $("logout").hidden = false;
    $("settingsBtn").hidden = false;
    showConnection(count);

    const draft = store.session.get("draft");
    if (draft) setComposer(draft);

    toast("تم تحميل " + count + " مستودع.", "ok", 2500);
    $("task").focus();
  } catch (error) {
    state.token = "";
    if (error instanceof AuthError) forgetToken();
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
  if (task.length > maxChars()) {
    toast("الرسالة أطول من الحد المسموح (" + maxChars() + " حرف).", "error", 4000);
    return;
  }

  state.busy = true;
  state.lastTask = task;
  state.abort = new AbortController();
  setLoading($("send"), true, "جارٍ التنفيذ");
  $("stop").hidden = false;
  $("stop").disabled = false;

  $("task").value = "";
  autosize();
  updateCount();
  store.session.remove("draft");

  addMessage("user", task);
  const prior = state.history.slice(-16);
  state.history.push({ role: "user", content: task });

  const progress = createProgress({ explore: state.prefs.agentic, verify: state.prefs.ciRepair });
  progress.update("scan");

  try {
    const result = await runTask(state.repo, task, prior, event => {
      if (event.type === "stage") progress.update(event.stage, event.message);
      else if (event.type === "note") progress.note(event.message);
    }, {
      signal: state.abort.signal,
      options: { ...state.prefs },
      skills: skillsPayload(state.skillState)
    });

    progress.stop();
    showResult(result);
  } catch (error) {
    progress.stop();
    state.history.pop();

    if (error instanceof AbortedError) {
      showCancelled(() => setComposer(state.lastTask));
    } else {
      showFailure(String((error && error.message) || error), () => setComposer(state.lastTask));
    }
  } finally {
    state.busy = false;
    state.abort = null;
    $("stop").hidden = true;
    setLoading($("send"), false);
    $("task").focus();
  }
}

async function logout() {
  if (state.busy) return;

  forgetToken();
  state.token = "";
  state.history = [];
  state.repos = [];
  state.repo = "";
  state.autoMerge = false;

  $("token").value = "";
  $("token").type = "password";
  $("remember").checked = false;
  $("toggleToken").firstElementChild.innerHTML = ICONS.eye;
  $("logout").hidden = true;
  $("settingsBtn").hidden = true;
  $("conn").hidden = true;
  updateTokenMeta();
  renderMergeNote();
  setBanner($("status"), "");

  await swap($("workspace"), $("login"));
  $("token").focus();
}

async function pasteToken() {
  try {
    const text = await navigator.clipboard.readText();
    $("token").value = normalizeToken(text);
    updateTokenMeta();
    $("token").focus();
  } catch {
    toast("تعذر قراءة الحافظة. الصق الرمز يدويًا في الحقل.", "info", 3000);
  }
}

function initEvents() {
  // يمنع المتصفح من تجاوز الحد (العداد يظهر قرب الحد، والخادم يتحقق أيضًا).
  $("task").maxLength = maxChars();

  $("connect").addEventListener("click", connect);
  $("token").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      connect();
    }
  });
  $("token").addEventListener("input", updateTokenMeta);
  // اللصق: نُنظّف الرمز بعد إدراجه مباشرة (مسافات، أسطر، اقتباس، Bearer).
  $("token").addEventListener("paste", () => {
    setTimeout(() => {
      $("token").value = normalizeToken($("token").value);
      updateTokenMeta();
    }, 0);
  });
  $("pasteToken").addEventListener("click", pasteToken);

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
  $("stop").addEventListener("click", () => {
    if (!state.abort) return;
    $("stop").disabled = true;
    state.abort.abort();
  });

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

// دخول تلقائي إن وُجد رمز محفوظ (للجلسة أو للجهاز).
function autoLogin() {
  const saved = loadSavedToken();
  if (!saved) return;

  $("token").value = saved.token;
  $("remember").checked = saved.remember;
  updateTokenMeta();
  connect();
}

state.prefs = loadPrefs();
state.skillState = loadSkillState();

hydrateIcons();
initRepoPicker();
initChatScroll();
initEvents();
initSettings({ onLogout: logout });
initPwa();
autoLogin();
