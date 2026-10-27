// حالة التطبيق المشتركة. رمز الإدارة يبقى في الذاكرة فقط ولا يُحفظ أبدًا.
export const state = {
  token: "",
  history: [],
  busy: false,
  lastTask: "",
  repos: [],
  repo: "",
  model: "",
  autoMerge: false
};
