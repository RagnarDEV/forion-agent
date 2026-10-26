import { h } from "./dom.js";
import { icon } from "./icons.js";
import { copyText } from "./clipboard.js";

const TICK = "`";
const FENCE = "```";

// عرض نص منسّق بسيط (كتل كود وكود مدمج) دون innerHTML لأي محتوى غير موثوق.
function appendInline(container, text) {
  text.split(TICK).forEach((segment, index) => {
    if (!segment) return;
    if (index % 2 === 1) container.appendChild(h("code", { class: "inline", text: segment }));
    else container.appendChild(document.createTextNode(segment));
  });
}

function codeBlock(code) {
  const button = h("button", { type: "button", class: "copy", "aria-label": "نسخ الكود" }, icon("copy"));

  button.addEventListener("click", async () => {
    if (await copyText(code, "تم نسخ الكود.")) {
      button.replaceChildren(icon("check"));
      setTimeout(() => button.replaceChildren(icon("copy")), 1500);
    }
  });

  return h("div", { class: "codeblock" }, h("pre", {}, h("code", { text: code })), button);
}

export function renderRich(container, text) {
  String(text).split(FENCE).forEach((part, index) => {
    if (index % 2 === 1) {
      container.appendChild(codeBlock(part.replace(/^[a-zA-Z0-9_+-]*\n/, "").replace(/\n$/, "")));
    } else {
      appendInline(container, part);
    }
  });
}
