import { h } from "./dom.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { saveSkillState } from "./prefs.js";
import { toast } from "./toast.js";

// إدارة المهارات من الواجهة: عرض، تفعيل (تلقائي/دائم/معطّل)، إضافة، تعديل، حذف، استيراد وتصدير.
// المهارات تُحفظ في هذا المتصفح وتُرسل مع كل طلب؛ المدمجة تأتي من الخادم (GET /api/skills).

const MODES = [["auto", "تلقائي"], ["always", "دائم"], ["off", "معطّل"]];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MIN_INSTRUCTIONS = 20;

let root = null;
let editing = null; // null | { skill: object|null }

const limits = () => ({
  maxSkills: (state.limits && state.limits.maxSkills) || 30,
  maxChars: (state.limits && state.limits.maxSkillChars) || 8000
});

const clean = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const persist = () => saveSkillState(state.skillState);
const builtinIds = () => new Set(state.builtinSkills.map(skill => skill.id));

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

function uniqueId(name, ignore) {
  const taken = new Set([
    ...builtinIds(),
    ...state.skillState.custom.filter(skill => skill.id !== ignore).map(skill => skill.id)
  ]);
  const base = slugify(name) || "skill";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = base + "-" + n++;
  return id;
}

const parseTags = value =>
  [...new Set(String(value).split(/[,،\n]/).map(tag => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 12);

const modeOf = (skill, custom) =>
  custom ? skill.mode || "auto" : state.skillState.modes[skill.id] || "auto";

function setMode(skill, custom, mode) {
  if (custom) {
    const target = state.skillState.custom.find(item => item.id === skill.id);
    if (target) target.mode = mode;
  } else if (mode === "auto") {
    delete state.skillState.modes[skill.id];
  } else {
    state.skillState.modes[skill.id] = mode;
  }

  persist();
  draw();
}

const iconButton = (name, label, onclick) =>
  h("button", { type: "button", class: "btn btn-ghost icon-only small", "aria-label": label, title: label, onclick }, icon(name));

function remove(skill) {
  if (!window.confirm("حذف المهارة «" + skill.name + "»؟")) return;

  state.skillState.custom = state.skillState.custom.filter(item => item.id !== skill.id);
  persist();
  draw();
  toast("تم حذف المهارة.", "info", 2200);
}

function duplicate(skill) {
  const { maxSkills } = limits();
  if (state.skillState.custom.length >= maxSkills) {
    toast("وصلت إلى الحد الأقصى للمهارات المخصصة (" + maxSkills + ").", "error", 3500);
    return;
  }

  const copy = {
    id: uniqueId(skill.id + "-custom"),
    name: skill.name + " (مخصصة)",
    description: skill.description || "",
    tags: [...(skill.tags || [])],
    instructions: skill.instructions,
    mode: "auto"
  };

  state.skillState.custom.push(copy);
  persist();
  editing = { skill: copy };
  draw();
}

function card(skill, custom) {
  const mode = modeOf(skill, custom);

  const segmented = h("div", { class: "seg", role: "group", "aria-label": "وضع التفعيل" },
    MODES.map(([value, label]) =>
      h("button", {
        type: "button",
        class: "seg-btn",
        "aria-pressed": String(mode === value),
        onclick: () => setMode(skill, custom, value)
      }, label)
    )
  );

  const actions = custom
    ? [iconButton("edit", "تعديل", () => { editing = { skill }; draw(); }), iconButton("trash", "حذف", () => remove(skill))]
    : [iconButton("copy", "نسخ كمهارة مخصصة للتعديل", () => duplicate(skill))];

  return h("article", { class: "skill" + (mode === "off" ? " off" : "") },
    h("div", { class: "skill-head" },
      h("div", { class: "skill-title" },
        h("strong", { text: skill.name }),
        h("span", { class: "badge", text: custom ? "مخصصة" : "مدمجة" })
      ),
      h("div", { class: "skill-actions" }, actions)
    ),
    skill.description ? h("p", { class: "skill-desc", text: skill.description }) : null,
    skill.tags && skill.tags.length
      ? h("div", { class: "tags" }, skill.tags.slice(0, 8).map(tag => h("span", { class: "tag", text: tag })))
      : null,
    segmented
  );
}

function exportSkills() {
  if (!state.skillState.custom.length) {
    toast("لا توجد مهارات مخصصة للتصدير.", "info", 2500);
    return;
  }

  const blob = new Blob([JSON.stringify(state.skillState.custom, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: "forion-skills.json" });

  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function importFile(file) {
  const { maxSkills, maxChars } = limits();

  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data && Array.isArray(data.custom) ? data.custom : [];
    const reserved = builtinIds();
    let added = 0;
    let skipped = 0;

    for (const raw of list) {
      const name = clean(raw && raw.name, 80);
      const instructions = clean(raw && raw.instructions, maxChars);

      if (!name || instructions.length < MIN_INSTRUCTIONS) {
        skipped++;
        continue;
      }

      const wantedId = raw && typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
      const id = ID_PATTERN.test(wantedId) && !reserved.has(wantedId) ? wantedId : uniqueId(name);
      const skill = {
        id,
        name,
        description: clean(raw.description, 300),
        tags: parseTags(Array.isArray(raw.tags) ? raw.tags.join(",") : ""),
        instructions,
        mode: ["auto", "always", "off"].includes(raw.mode) ? raw.mode : "auto"
      };

      const index = state.skillState.custom.findIndex(item => item.id === id);
      if (index >= 0) state.skillState.custom[index] = skill;
      else if (state.skillState.custom.length < maxSkills) state.skillState.custom.push(skill);
      else {
        skipped++;
        continue;
      }
      added++;
    }

    persist();
    draw();
    toast("تم استيراد " + added + " مهارة" + (skipped ? " (تجاهلت " + skipped + ")" : "") + ".", added ? "ok" : "error", 3500);
  } catch {
    toast("ملف المهارات غير صالح. يجب أن يكون JSON.", "error", 3500);
  }
}

function field(label, id, control, hint) {
  return h("div", { class: "field" },
    h("label", { for: id, text: label }),
    control,
    hint ? h("p", { class: "field-hint", text: hint }) : null
  );
}

function editor() {
  const { maxChars } = limits();
  const skill = editing.skill;

  const name = h("input", { id: "skName", type: "text", maxlength: 80, autocomplete: "off", placeholder: "مثال: قواعد كود الفريق", value: skill ? skill.name : "" });
  const description = h("input", { id: "skDesc", type: "text", maxlength: 300, autocomplete: "off", placeholder: "وصف قصير يظهر في القائمة", value: skill ? skill.description || "" : "" });
  const tags = h("input", { id: "skTags", type: "text", autocomplete: "off", placeholder: "api، قاعدة بيانات، security", value: skill ? (skill.tags || []).join("، ") : "" });
  const mode = h("select", { id: "skMode" },
    MODES.map(([value, label]) => h("option", { value, selected: (skill ? skill.mode : "auto") === value }, label))
  );
  const instructions = h("textarea", { id: "skBody", rows: 9, maxlength: maxChars, placeholder: "اكتب التعليمات التي تريد أن يلتزم بها النموذج…" }, skill ? skill.instructions : "");
  const counter = h("span", { class: "field-hint", text: "" });

  const updateCounter = () => { counter.textContent = instructions.value.length + " / " + maxChars; };
  instructions.addEventListener("input", updateCounter);
  updateCounter();

  const save = () => {
    const title = name.value.trim();
    const body = instructions.value.trim();

    if (title.length < 2) { toast("اكتب اسمًا للمهارة.", "error", 2800); name.focus(); return; }
    if (body.length < MIN_INSTRUCTIONS) { toast("التعليمات قصيرة جدًا (" + MIN_INSTRUCTIONS + " أحرف على الأقل).", "error", 3200); instructions.focus(); return; }

    const record = {
      id: skill ? skill.id : uniqueId(title),
      name: title,
      description: description.value.trim().slice(0, 300),
      tags: parseTags(tags.value),
      instructions: body.slice(0, maxChars),
      mode: mode.value
    };

    const index = state.skillState.custom.findIndex(item => item.id === record.id);
    if (index >= 0) state.skillState.custom[index] = record;
    else {
      const { maxSkills } = limits();
      if (state.skillState.custom.length >= maxSkills) {
        toast("وصلت إلى الحد الأقصى للمهارات المخصصة (" + maxSkills + ").", "error", 3500);
        return;
      }
      state.skillState.custom.push(record);
    }

    persist();
    editing = null;
    draw();
    toast("تم حفظ المهارة.", "ok", 2200);
  };

  return h("div", { class: "skill-editor" },
    h("h3", { text: skill ? "تعديل المهارة" : "مهارة جديدة" }),
    field("الاسم", "skName", name),
    field("الوصف", "skDesc", description),
    field("كلمات التفعيل", "skTags", tags, "تُفعَّل المهارة تلقائيًا عند ظهور إحدى هذه الكلمات في طلبك. افصل بينها بفاصلة."),
    field("وضع التفعيل", "skMode", mode),
    field("التعليمات", "skBody", instructions),
    counter,
    h("div", { class: "form-actions" },
      h("button", { type: "button", class: "btn btn-primary", onclick: save }, icon("check"), h("span", { text: "حفظ" })),
      h("button", { type: "button", class: "btn btn-ghost", onclick: () => { editing = null; draw(); } }, h("span", { text: "إلغاء" }))
    )
  );
}

function draw() {
  if (!root) return;

  if (editing) {
    root.replaceChildren(editor());
    return;
  }

  const custom = state.skillState.custom;
  const picker = h("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    "aria-label": "استيراد مهارات",
    onchange: event => {
      const file = event.target.files && event.target.files[0];
      if (file) importFile(file);
      event.target.value = "";
    }
  });

  root.replaceChildren(
    h("p", { class: "sub", text: "المهارات تعليمات إضافية تُرسل للنموذج عند الحاجة. «تلقائي» يفعّلها عند ظهور كلمات التفعيل في طلبك، و«دائم» يرسلها مع كل طلب." }),
    h("div", { class: "skill-tools" },
      h("button", { type: "button", class: "btn btn-primary small", onclick: () => { editing = { skill: null }; draw(); } }, icon("plus"), h("span", { text: "مهارة جديدة" })),
      h("button", { type: "button", class: "btn btn-ghost small", onclick: () => picker.click() }, icon("upload"), h("span", { text: "استيراد" })),
      h("button", { type: "button", class: "btn btn-ghost small", onclick: exportSkills }, icon("download"), h("span", { text: "تصدير" }))
    ),
    picker,
    h("h3", { class: "group-title", text: "مهاراتي (" + custom.length + ")" }),
    custom.length
      ? custom.map(skill => card(skill, true))
      : h("p", { class: "sub empty", text: "لا توجد مهارات مخصصة بعد. أضف مهارة جديدة أو انسخ إحدى المدمجة وعدّلها." }),
    h("h3", { class: "group-title", text: "المهارات المدمجة (" + state.builtinSkills.length + ")" }),
    state.builtinSkills.length
      ? state.builtinSkills.map(skill => card(skill, false))
      : h("p", { class: "sub empty", text: "تعذر تحميل المهارات المدمجة من الخادم." })
  );
}

export function renderSkills(container) {
  root = container;
  editing = null;
  draw();
}
