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
  builtinSkills: []
};
