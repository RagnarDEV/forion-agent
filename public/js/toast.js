import { $, h } from "./dom.js";
import { icon } from "./icons.js";

// إشعار مؤقت يختفي تلقائيًا (أقصى عدد 3).
export function toast(text, kind = "info", ms = 3200) {
  const host = $("toasts");
  const iconName = kind === "error" ? "alert" : kind === "ok" ? "check" : "info";
  const node = h("div", { class: "toast " + kind, role: kind === "error" ? "alert" : "status" },
    icon(iconName),
    h("span", { text })
  );

  host.appendChild(node);
  while (host.children.length > 3) host.firstElementChild.remove();

  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 220);
  }, ms);
}
