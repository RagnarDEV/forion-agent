// حالة التطبيق المشتركة. رمز الإدارة يُحفظ بحسب اختيار المستخدم (انظر prefs.js).
export const state = {
  token: "",
  history: [],
  busy: false,
  abort: null,
  lastTask: "",
  repos: [],
  repo: "",
  model: "",
  autoMerge: false,
  limits: null,
  defaults: null,
  prefs: null,
  skillState: { custom: [], modes: {} },
  builtinSkills: [],
  // التوجيه الذكي: الإعدادات والدفتر والإحصاءات وملف القدرات تُحفظ محليًا (انظر router-store.js)،
  // وcatalog يأتي من الخادم (النماذج والأسعار ووضع التثبيت).
  router: {
    settings: null,
    ledger: null,
    stats: { entries: {} },
    profile: { models: {} },
    catalog: null
  }
};
