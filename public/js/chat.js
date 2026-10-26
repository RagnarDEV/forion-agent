import { $, h, formatClock, pad2, reduceMotion } from "./dom.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { renderRich } from "./rich-text.js";
import { copyText } from "./clipboard.js";
import { STAGES, SUGGESTIONS, WELCOME } from "./strings.js";

const NEAR_PX = 140;
const FAR_PX = 240;

function distanceFromBottom() {
  const chat = $("chat");
  return chat.scrollHeight - chat.scrollTop - chat.clientHeight;
}

export const isNearBottom = () => distanceFromBottom() < NEAR_PX;
const updateToBottom = () => { $("toBottom").hidden = distanceFromBottom() < FAR_PX; };

// تمرير ذكي: لا يُقاطع المستخدم إن كان يقرأ رسائل قديمة.
export function scrollChat(force) {
  const chat = $("chat");
  if (force) {
    chat.scrollTo({ top: chat.scrollHeight, behavior: reduceMotion.matches ? "auto" : "smooth" });
  } else {
    updateToBottom();
  }
}

export function initChatScroll() {
  $("chat").addEventListener("scroll", updateToBottom, { passive: true });
  $("toBottom").addEventListener("click", () => scrollChat(true));
}

export function addMessage(role, text, opts = {}) {
  const stick = opts.stick !== undefined ? opts.stick : role === "user" || isNearBottom();
  const welcome = $("welcome");
  if (welcome) welcome.remove();

  const bubble = h("div", { class: "bubble" });
  if (role === "assistant" && !opts.error && text) renderRich(bubble, text);
  else bubble.textContent = text;

  const who = h("div", { class: "who" },
    h("span", { text: role === "user" ? "أنت" : "Forion Agent" }),
    h("time", { text: formatClock(new Date()) })
  );
  const body = h("div", { class: "body" }, who, bubble);
  const root = h("div", { class: "msg " + role + (opts.error ? " error" : ""), role: opts.error ? "alert" : false },
    h("div", { class: "avatar", "aria-hidden": "true", text: role === "user" ? "أنت" : "F" }),
    body
  );

  $("chat").appendChild(root);
  scrollChat(stick);
  return { root, body, bubble };
}

export function renderWelcome(onPick) {
  const cards = SUGGESTIONS.map(item =>
    h("button", { type: "button", class: "suggest", onclick: () => onPick(item.prompt) },
      h("span", { class: "suggest-ico" }, icon(item.icon)),
      h("span", { class: "suggest-title", text: item.title }),
      h("span", { class: "suggest-hint", text: item.hint })
    )
  );

  $("chat").replaceChildren(
    h("div", { class: "welcome", id: "welcome" },
      h("div", { class: "spark", "aria-hidden": "true" }, icon("zap")),
      h("h2", { class: "grad-text", text: WELCOME.title }),
      h("p", { text: WELCOME.text }),
      h("div", { class: "suggestions" }, cards)
    )
  );
  updateToBottom();
}

// بطاقة تقدم حية: خطوات + تفاصيل + عدّاد زمن.
export function createProgress() {
  const msg = addMessage("assistant", "", { stick: true });
  msg.bubble.classList.add("progress");

  const items = {};
  const list = h("ol", { class: "steps" });

  STAGES.forEach(([key, label]) => {
    const detail = h("span", { class: "detail" });
    const li = h("li", { class: "step" },
      h("span", { class: "dot" }, icon("check")),
      h("span", { class: "step-text" }, h("span", { text: label }), detail)
    );
    items[key] = { li, detail };
    list.appendChild(li);
  });

  const elapsed = h("div", { class: "elapsed", text: "00:00" });
  msg.bubble.append(list, h("div", { class: "bar", "aria-hidden": "true" }), elapsed);

  const started = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    elapsed.textContent = pad2(Math.floor(seconds / 60)) + ":" + pad2(seconds % 60);
  }, 1000);

  const keys = STAGES.map(entry => entry[0]);

  return {
    update(stage, text) {
      const current = keys.indexOf(stage);
      if (current < 0) return;

      keys.forEach((key, index) => {
        items[key].li.className = "step" + (index < current ? " done" : index === current ? " active" : "");
        items[key].detail.textContent = index === current && text ? text : "";
      });
      $("sr").textContent = text || STAGES[current][1];
    },
    stop() {
      clearInterval(timer);
      msg.root.remove();
    }
  };
}

function addActions(body, text) {
  const copy = h("button", {
    type: "button",
    class: "mini-btn",
    "aria-label": "نسخ الرد",
    onclick: () => copyText(text, "تم نسخ الرد.")
  }, icon("copy"), h("span", { text: "نسخ" }));

  body.appendChild(h("div", { class: "actions" }, copy));
}

export function showResult(result) {
  const summary = String(result.summary || "").trim() || "اكتمل التنفيذ.";
  const message = addMessage("assistant", summary, { stick: true });

  if (result.noChanges) {
    addActions(message.body, summary);
    state.history.push({ role: "assistant", content: summary });
    return;
  }

  const files = Array.isArray(result.files) ? result.files : [];
  const chips = h("div", { class: "chips" },
    ["الفرع: " + result.branch, ...files].map(label => h("span", { class: "chip", text: label }))
  );
  const card = h("div", { class: "result" },
    h("div", { class: "result-head" }, icon("pr"), h("span", { text: "تم إنشاء Pull Request" })),
    chips
  );

  if (typeof result.url === "string" && /^https:\/\/github\.com\//.test(result.url)) {
    card.appendChild(h("a", {
      class: "btn btn-primary small",
      href: result.url,
      target: "_blank",
      rel: "noopener noreferrer"
    }, h("span", { text: "فتح Pull Request" }), icon("external")));
  }

  message.body.appendChild(card);
  addActions(message.body, summary);
  state.history.push({
    role: "assistant",
    content: summary + "\nالفرع: " + result.branch + "\nالملفات: " + files.join(", ")
  });
  scrollChat(true);
}

export function showFailure(text, onRetry) {
  const message = addMessage("assistant", "تعذر تنفيذ الطلب:\n" + text, { error: true, stick: true });
  const retry = h("button", { type: "button", class: "btn btn-ghost small" }, icon("refresh"), h("span", { text: "إعادة المحاولة" }));

  retry.addEventListener("click", () => {
    onRetry();
    retry.disabled = true;
  });

  message.body.appendChild(retry);
  scrollChat(true);
}
