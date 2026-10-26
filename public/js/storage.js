// تخزين آمن (لا يُخزّن هنا أي أسرار). يتجاهل أخطاء الوضع الخاص.
const PREFIX = "forion:";

function make(area) {
  return {
    get(key) {
      try { return window[area].getItem(PREFIX + key); } catch { return null; }
    },
    set(key, value) {
      try { window[area].setItem(PREFIX + key, value); } catch {}
    },
    remove(key) {
      try { window[area].removeItem(PREFIX + key); } catch {}
    }
  };
}

export const store = {
  local: make("localStorage"),
  session: make("sessionStorage")
};
