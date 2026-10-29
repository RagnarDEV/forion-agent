import { $, h } from "./dom.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { DEFAULT_PREFS, savePrefs, saveToken, forgetToken, isTokenRemembered } from "./prefs.js";
import { renderSkills } from "./skills-ui.js";
import { canInstall, installApp, isIOS, isStandalone, onInstallChange } from "./pwa.js";
import { toast } from "./toast.js";

// لوحة الإعدادات: عام (سلوك الوكيل) · المهارات · الحساب والتثبيت.

const TABS = [
  ["general", "عام", "sliders"],
  ["skills", "المهارات", "book"],
  ["account", "الحساب", "user"]
];

let activeTab = "general";
let onLogout = () => {};

const dialog = () => $("settingsDialog");

function toggleRow(key, title, description) {
  const id = "pref-" + key;
  const input = h("input", {
    id,
    type: "checkbox",
    checked: Boolean(state.prefs[key]),
    onchange: event => {
      state.prefs[key] = event.target.checked;
      savePrefs(state.prefs);
    }
  });

  return h("div", { class: "setting" },
    h("label", { class: "setting-text", for: id }, h("strong", { text: title }), h("span", { text: description })),
    h("span", { class: "switch" }, input, h("span", { class: "track", "aria-hidden": "true" }))
  );
}

function selectRow(key, title, description, values, format) {
  const id = "pref-" + key;
  const select = h("select", {
    id,
    onchange: event => {
      state.prefs[key] = Number(event.target.value);
      savePrefs(state.prefs);
    }
  }, values.map(value => h("option", { value, selected: state.prefs[key] === value }, format(value))));

  return h("div", { class: "setting" },
    h("label", { class: "setting-text", for: id }, h("strong", { text: title }), h("span", { text: description })),
    select
  );
}

const kb = bytes => Math.round(bytes / 1000) + "KB";

function infoRow(label, value) {
  return h("div", { class: "info-row" }, h("span", { text: label }), h("strong", { text: value }));
}

function generalPanel() {
  const limits = state.limits || {};

  return h("div", { class: "panel-body" },
    toggleRow("agentic", "الاستكشاف الذكي", "يبحث في الكود ويقرأ الـ issues والـ Pull Requests قبل التنفيذ لاختيار الملفات الصحيحة."),
    toggleRow("ciRepair", "فحص CI والإصلاح الذاتي", "ينتظر فحوصات GitHub بعد إنشاء الـ Pull Request، وعند فشلها يقرأ السجل ويضيف commit إصلاح."),
    toggleRow("allowCreate", "إنشاء وحذف ونقل الملفات", "يسمح للوكيل بإضافة ملفات جديدة وحذف أو نقل ملفات قائمة عند الحاجة."),
    selectRow("attempts", "محاولات التوليد", "كل محاولة فاشلة تُعاد مع سبب الرفض ليصحح النموذج نفسه.", [1, 2, 3, 4, 5, 6, 7, 8], n => n + (n === 4 ? " (الافتراضي)" : "")),
    selectRow("repairRounds", "جولات الإصلاح الذاتي", "أقصى عدد لمحاولات إصلاح فشل الفحوصات.", [0, 1, 2, 3, 4], n => (n === 0 ? "بلا إصلاح" : String(n))),
    h("div", { class: "info-card" },
      h("h3", { text: "معلومات الخادم" }),
      infoRow("النموذج", state.model || "—"),
      infoRow("حد الرسالة", (limits.maxTaskChars || 50000) + " حرف"),
      infoRow("حجم الملف الأقصى", limits.maxFileBytes ? kb(limits.maxFileBytes) : "—"),
      infoRow("إعادة الكتابة الكاملة حتى", limits.fullRewriteBytes ? kb(limits.fullRewriteBytes) + " (الأكبر يُعدَّل جزئيًا)" : "—"),
      infoRow("الدمج التلقائي", state.autoMerge ? "مفعّل" : "معطّل")
    ),
    h("button", {
      type: "button",
      class: "btn btn-ghost small",
      onclick: () => {
        state.prefs = { ...DEFAULT_PREFS };
        savePrefs(state.prefs);
        draw();
        toast("أُعيدت الإعدادات الافتراضية.", "info", 2200);
      }
    }, icon("refresh"), h("span", { text: "استعادة الإعدادات الافتراضية" }))
  );
}

function installSection() {
  if (isStandalone()) {
    return h("p", { class: "sub", text: "التطبيق مثبّت ويعمل بوضع ملء الشاشة." });
  }

  if (canInstall()) {
    return h("button", {
      type: "button",
      class: "btn btn-primary",
      onclick: async () => {
        const accepted = await installApp();
        if (accepted) toast("تم تثبيت التطبيق.", "ok", 2500);
      }
    }, icon("phone"), h("span", { text: "تثبيت التطبيق على الهاتف" }));
  }

  return h("p", {
    class: "sub",
    text: isIOS()
      ? "على iPhone: افتح الموقع في Safari ثم اضغط مشاركة ← إضافة إلى الشاشة الرئيسية."
      : "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
  });
}

function accountPanel() {
  const remember = h("input", {
    id: "rememberToken",
    type: "checkbox",
    checked: isTokenRemembered(),
    onchange: event => {
      saveToken(state.token, event.target.checked);
      toast(event.target.checked ? "سيُحفظ الرمز على هذا الجهاز 30 يومًا." : "لن يُحفظ الرمز إلا لهذه الجلسة.", "info", 2800);
    }
  });

  return h("div", { class: "panel-body" },
    h("div", { class: "setting" },
      h("label", { class: "setting-text", for: "rememberToken" },
        h("strong", { text: "تذكّرني على هذا الجهاز" }),
        h("span", { text: "يحفظ رمز الإدارة 30 يومًا لتجنب إدخاله كل مرة. لا تفعّله على جهاز مشترك." })
      ),
      h("span", { class: "switch" }, remember, h("span", { class: "track", "aria-hidden": "true" }))
    ),
    h("div", { class: "button-row" },
      h("button", {
        type: "button",
        class: "btn btn-ghost small",
        onclick: () => {
          forgetToken();
          remember.checked = false;
          toast("نُسي الرمز المحفوظ. ستحتاج إلى إدخاله عند التحديث.", "info", 3000);
        }
      }, icon("lock"), h("span", { text: "نسيان الرمز المحفوظ" })),
      h("button", {
        type: "button",
        class: "btn btn-ghost small",
        onclick: () => {
          dialog().close();
          onLogout();
        }
      }, icon("logout"), h("span", { text: "تسجيل الخروج" }))
    ),
    h("div", { class: "info-card" },
      h("h3", { text: "التطبيق" }),
      installSection()
    )
  );
}

function skillsPanel() {
  const box = h("div", { class: "panel-body", id: "skillsRoot" });
  renderSkills(box);
  return box;
}

function draw() {
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "أقسام الإعدادات" },
    TABS.map(([key, label, iconName]) =>
      h("button", {
        type: "button",
        class: "tab",
        role: "tab",
        id: "tab-" + key,
        "aria-selected": String(activeTab === key),
        "aria-controls": "settingsPanel",
        onclick: () => { activeTab = key; draw(); }
      }, icon(iconName), h("span", { text: label }))
    )
  );

  const panel = activeTab === "skills" ? skillsPanel() : activeTab === "account" ? accountPanel() : generalPanel();
  const wrapper = h("div", { class: "panel", id: "settingsPanel", role: "tabpanel", "aria-labelledby": "tab-" + activeTab }, panel);

  $("settingsBody").replaceChildren(tabs, wrapper);
}

function open() {
  draw();
  if (!dialog().open) dialog().showModal();
}

export function initSettings(handlers) {
  onLogout = handlers.onLogout;

  $("settingsBtn").addEventListener("click", open);
  $("settingsClose").addEventListener("click", () => dialog().close());
  dialog().addEventListener("click", event => {
    if (event.target === dialog()) dialog().close();
  });

  onInstallChange(() => {
    if (dialog().open && activeTab === "account") draw();
  });
}
