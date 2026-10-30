import { icon } from "./icons.js";

export const $ = id => document.getElementById(id);
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// مساعد بناء عناصر DOM بدون innerHTML: كل النصوص تُدرَج كـ textContent.
export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }

  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  for (const child of children.flat(Infinity)) {
    // إدراج البطاقات والمصفوفات نفسها كعناصر صحيحة إذا لم تندرج تحت الشرط السابق
    if (child == null || child === false) continue;
    const realChild = child instanceof Node ? child : document.createTextNode(String(child));
    node.append(realChild);
  }

  return node;
}

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
export const formatClock = date => clock.format(date);
export const pad2 = n => String(n).padStart(2, "0");

export function setBanner(el, text, kind) {
  if (!text) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }

  el.hidden = false;
  el.className = "banner" + (kind ? " " + kind : "");
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.replaceChildren(
    icon(kind === "error" ? "alert" : kind === "ok" ? "check" : "info"),
    h("span", { text })
  );
}

export function setLoading(btn, on, text) {
  const label = btn.querySelector(".lbl");
  const spinner = btn.querySelector(".spin");

  if (on) {
    if (label && !btn.dataset.label) btn.dataset.label = label.textContent;
    if (label) label.textContent = text;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    if (!spinner) btn.prepend(h("span", { class: "spin", "aria-hidden": "true" }));
    return;
  }

  if (spinner) spinner.remove();
  if (label && btn.dataset.label) label.textContent = btn.dataset.label;
  delete btn.dataset.label;
  btn.disabled = false;
  btn.removeAttribute("aria-busy");
}

// انتقال غير متماثل: خروج أسرع (160ms) ثم دخول أبطأ (320ms).
export async function swap(from, to) {
  if (reduceMotion.matches || !from.animate) {
    from.hidden = true;
    to.hidden = false;
    return;
  }

  const out = from.animate(
    [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-8px)" }],
    { duration: 160, easing: "ease-in", fill: "forwards" }
  );
  try { await out.finished; } catch {}

  from.hidden = true;
  out.cancel();
  to.hidden = false;
  to.animate(
    [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" }
  );
}
