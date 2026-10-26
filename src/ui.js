export const HTML = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0F172A">
<title>Forion Agent</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap">
<style>
:root{
color-scheme:dark;
--bg:#0F172A;--bg-deep:#020617;--surface:#1B2336;--surface-2:#232D45;--muted:#272F42;
--fg:#F8FAFC;--fg-2:#CBD5E1;--fg-muted:#94A3B8;
--border:#334155;--border-strong:#64748B;
--primary:#7C3AED;--violet:#A78BFA;--cyan:#22D3EE;--green:#22C55E;--red:#FCA5A5;
--font-ui:"IBM Plex Sans","Noto Sans Arabic","Segoe UI",Tahoma,system-ui,sans-serif;
--font-display:"Space Grotesk","Noto Sans Arabic","Segoe UI",Tahoma,system-ui,sans-serif;
--font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
--r-md:14px;--r-lg:20px;--ease:cubic-bezier(.22,1,.36,1)
}
*{box-sizing:border-box}
html{background:var(--bg-deep);-webkit-text-size-adjust:100%}
body{margin:0;color:var(--fg);font:400 16px/1.6 var(--font-ui);-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;z-index:-1;background:radial-gradient(60rem 36rem at 85% -10%,rgba(124,58,237,.28),transparent 60%),radial-gradient(48rem 30rem at -10% 110%,rgba(34,211,238,.12),transparent 60%),linear-gradient(180deg,var(--bg),var(--bg-deep))}
[hidden]{display:none!important}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
:focus-visible{outline:2px solid var(--violet);outline-offset:2px}
.ico{display:inline-flex;flex:none}
.ico svg{width:18px;height:18px}

.app{max-width:920px;margin:0 auto;height:100vh;height:100dvh;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 16px 0}
header{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)}
.logo{width:44px;height:44px;flex:none;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#6D28D9,#7C3AED 55%,#0891B2);box-shadow:0 8px 24px -8px rgba(124,58,237,.6)}
.logo svg{width:24px;height:24px}
.brand{flex:1;min-width:0}
.brand h1{margin:0;font:700 20px/1.2 var(--font-display);letter-spacing:-.01em}
.brand p{margin:2px 0 0;font-size:13px;color:var(--fg-muted)}
main{flex:1;min-height:0;display:flex;flex-direction:column}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:var(--r-md);border:1px solid transparent;color:#fff;font:600 15px/1 var(--font-ui);cursor:pointer;touch-action:manipulation;text-decoration:none;transition:transform .15s var(--ease),box-shadow .2s var(--ease),border-color .15s}
.btn-primary{background:linear-gradient(135deg,#6D28D9,#7C3AED);box-shadow:0 8px 22px -10px rgba(124,58,237,.9)}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 12px 28px -10px rgba(124,58,237,1)}
.btn-ghost{background:var(--muted);border-color:var(--border);color:var(--fg)}
.btn-ghost:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.btn:active{transform:scale(.98)}
.btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.btn[aria-busy="true"]{cursor:progress}
.btn.block{width:100%;margin-top:16px}
.btn.small{min-height:44px;font-size:14px;margin-top:10px}
.icon-only{width:46px;padding:0;flex:none}
.flip .ico svg,.flip svg{transform:scaleX(-1)}
.spin{width:16px;height:16px;flex:none;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .8s linear infinite}

#login{width:min(100%,460px);margin:auto;padding:28px 24px;background:linear-gradient(180deg,rgba(35,45,69,.85),rgba(27,35,54,.92));border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:0 24px 60px -28px rgba(0,0,0,.8);animation:rise .45s var(--ease) both}
#login h2{margin:0 0 6px;font:700 22px/1.3 var(--font-display)}
.sub{margin:0;color:var(--fg-muted);font-size:14px}
.hint{margin:16px 0 0;color:var(--fg-muted);font-size:13px}
label{display:block;font-size:14px;font-weight:600;margin:18px 0 8px;color:var(--fg-2)}
input,textarea,select{width:100%;min-height:46px;padding:11px 14px;border-radius:var(--r-md);border:1px solid var(--border-strong);background:#0B1222;color:var(--fg);font:400 16px/1.5 var(--font-ui);transition:border-color .15s,box-shadow .15s}
input:focus-visible,select:focus-visible{outline:none;border-color:var(--violet);box-shadow:0 0 0 3px rgba(167,139,250,.35)}
.inputwrap{position:relative}
.token-input{font-family:var(--font-mono);letter-spacing:.04em;padding-right:52px;text-align:left}
.eye{position:absolute;top:3px;right:4px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--fg-muted);cursor:pointer}
.eye:hover{color:var(--fg);background:var(--muted)}

.banner{margin-top:14px;padding:10px 12px;border-radius:12px;font-size:14px;display:flex;gap:8px;align-items:flex-start;border:1px solid var(--border);background:var(--muted);color:var(--fg-2);white-space:pre-wrap;overflow-wrap:anywhere;animation:rise .2s var(--ease) both}
.banner.error{color:var(--red);background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.4)}
.banner.ok{color:#86EFAC;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.35)}
.banner .ico{margin-top:3px}

#workspace{flex:1;min-height:0;display:flex;flex-direction:column}
.toolbar{display:flex;align-items:center;gap:8px;padding:12px 0 4px}
.toolbar label{margin:0;white-space:nowrap}
.toolbar select{flex:1;min-width:0}
#chat{flex:1;min-height:0;overflow-y:auto;padding:16px 0 8px;display:flex;flex-direction:column;gap:18px;overscroll-behavior:contain}
.welcome{margin:auto;max-width:560px;text-align:center;padding:24px 8px;animation:rise .45s var(--ease) both}
.spark{width:56px;height:56px;margin:0 auto 14px;border-radius:18px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#6D28D9,#0891B2);box-shadow:0 16px 40px -16px rgba(124,58,237,.9)}
.spark .ico svg{width:28px;height:28px}
.welcome h2{margin:0 0 8px;font:700 26px/1.3 var(--font-display);text-wrap:balance}
.welcome p{margin:0 auto;max-width:46ch;color:var(--fg-muted)}
.quick{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px}
.chipbtn{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font:500 14px var(--font-ui);cursor:pointer;touch-action:manipulation;transition:transform .15s var(--ease),border-color .15s}
.chipbtn:hover{transform:translateY(-1px);border-color:var(--violet)}
.chipbtn:active{transform:scale(.98)}

.msg{display:flex;gap:10px;align-items:flex-start;animation:rise .28s var(--ease) both}
.avatar{flex:0 0 34px;height:34px;border-radius:11px;display:grid;place-items:center;font:700 12px var(--font-display);background:var(--muted);border:1px solid var(--border)}
.msg.assistant .avatar{background:linear-gradient(135deg,#6D28D9,#0891B2);border:0;color:#fff}
.msg.user .avatar{background:#3B2A7A;border-color:#5B3FC4}
.body{min-width:0;flex:1}
.who{font-size:12px;font-weight:500;color:var(--fg-muted);margin-bottom:6px}
.bubble{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-size:15px}
.msg.user .bubble{display:inline-block;max-width:100%;padding:10px 14px;border-radius:var(--r-md);background:rgba(124,58,237,.16);border:1px solid rgba(167,139,250,.35)}
.msg.error .bubble{padding:10px 14px;border-radius:var(--r-md);color:var(--red);background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4)}
code.inline{font:500 .9em var(--font-mono);background:var(--muted);border:1px solid var(--border);border-radius:6px;padding:1px 6px;direction:ltr;unicode-bidi:isolate}
.codeblock{position:relative;margin:10px 0;white-space:normal;background:#0B1222;border:1px solid var(--border);border-radius:var(--r-md);direction:ltr;text-align:left}
.codeblock pre{margin:0;padding:14px 48px 14px 14px;overflow-x:auto;font:400 13px/1.7 var(--font-mono);white-space:pre}
.codeblock .copy{position:absolute;top:6px;right:6px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:9px;background:var(--muted);color:var(--fg-2);cursor:pointer}
.codeblock .copy:hover{color:var(--fg)}

.steps{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:10px}
.step{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--fg-muted)}
.step .dot{width:22px;height:22px;flex:none;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--border-strong);color:transparent}
.step .dot .ico svg{width:13px;height:13px;stroke-width:3}
.step.active{color:var(--fg)}
.step.active .dot{border-color:var(--cyan);border-top-color:transparent;animation:spin .9s linear infinite}
.step.done{color:var(--fg-2)}
.step.done .dot{background:var(--green);border-color:var(--green);color:#052E16}
.bar{position:relative;height:3px;margin-top:14px;border-radius:3px;overflow:hidden;background:var(--muted)}
.bar::after{content:"";position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(90deg,transparent,var(--cyan),transparent);animation:slide 1.4s ease-in-out infinite}
.elapsed{margin-top:8px;font:400 12px var(--font-mono);color:var(--fg-muted);direction:ltr;text-align:right}

.result{margin-top:12px;padding:14px;border:1px solid var(--border);background:var(--surface);border-radius:var(--r-md);white-space:normal}
.result-head{display:flex;align-items:center;gap:8px;font-weight:600;color:#86EFAC}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
.chip{display:inline-block;max-width:100%;padding:3px 10px;border-radius:999px;border:1px solid var(--border);background:var(--muted);color:var(--fg-2);font:500 12px/1.6 var(--font-mono);direction:ltr;overflow-wrap:anywhere}

.composer{padding:8px 0 calc(10px + env(safe-area-inset-bottom))}
.composerbox{background:var(--surface);border:1px solid var(--border-strong);border-radius:18px;padding:8px;transition:border-color .15s,box-shadow .15s}
.composerbox:focus-within{border-color:var(--violet);box-shadow:0 0 0 3px rgba(167,139,250,.25)}
#task{display:block;border:0;background:transparent;resize:none;min-height:50px;max-height:36vh;padding:8px 10px;line-height:1.7;overflow-y:auto}
#task:focus-visible{outline:none;box-shadow:none}
.composerfoot{display:flex;align-items:center;gap:10px;padding-top:4px}
.kbd{flex:1;min-width:0;font-size:12px;color:var(--fg-muted)}
.ai-note{margin:8px 4px 0;font-size:12px;color:var(--fg-muted)}

@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slide{from{transform:translateX(-120%)}to{transform:translateX(320%)}}
html[data-paused] *,html[data-paused] *::after{animation-play-state:paused!important}
@media (max-width:520px){
.app{padding-left:12px;padding-right:12px}
.brand p{display:none}
.kbd{display:none}
.composerfoot{justify-content:flex-end}
.toolbar label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
#login{padding:22px 18px}
}
@media (prefers-reduced-motion:reduce){
*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
</style>
</head>
<body>
<div class="app">
<header>
<div class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
<div class="brand"><h1>Forion Agent</h1><p>مساعدك البرمجي لتطوير مستودعات GitHub</p></div>
<button class="btn btn-ghost" id="logout" type="button" hidden><span data-icon="logout"></span><span>خروج</span></button>
</header>

<main>
<section id="login" aria-labelledby="loginTitle">
<h2 id="loginTitle">ابدأ المحادثة</h2>
<p class="sub">اتصل بمستودعاتك لتحليل الملفات وتطوير المشروع. تُرسل التغييرات إلى فرع مستقل مع Pull Request ولا تُدمج تلقائيًا.</p>
<label for="token">رمز الإدارة (ADMIN_TOKEN)</label>
<div class="inputwrap">
<input id="token" class="token-input" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" placeholder="••••••••">
<button class="eye" id="toggleToken" type="button" aria-label="إظهار الرمز" aria-pressed="false"><span data-icon="eye"></span></button>
</div>
<button class="btn btn-primary block" id="connect" type="button"><span data-icon="lock"></span><span class="lbl">اتصال بـ GitHub</span></button>
<div id="status" class="banner" role="status" hidden></div>
<p class="hint">لا تضع GITHUB_TOKEN في المتصفح. احتفظ بالمفاتيح داخل أسرار Worker في Cloudflare.</p>
</section>

<section id="workspace" hidden>
<div class="toolbar">
<label for="repo">المستودع</label>
<select id="repo"></select>
<button class="btn btn-ghost icon-only" id="refresh" type="button" aria-label="تحديث قائمة المستودعات"><span data-icon="refresh"></span></button>
<button class="btn btn-ghost icon-only" id="clear" type="button" aria-label="محادثة جديدة"><span data-icon="plus"></span></button>
</div>
<div id="wsStatus" class="banner" role="status" hidden></div>
<div id="chat" role="log" aria-live="polite" aria-label="المحادثة"></div>
<div class="composer">
<div class="composerbox">
<label class="sr" for="task">رسالتك</label>
<textarea id="task" rows="1" maxlength="4000" placeholder="اكتب رسالتك إلى Forion Agent..."></textarea>
<div class="composerfoot">
<span class="kbd">Enter للإرسال · Shift+Enter لسطر جديد</span>
<button class="btn btn-primary flip" id="send" type="button"><span data-icon="send"></span><span class="lbl">إرسال</span></button>
</div>
</div>
<p class="ai-note">المحتوى مُولَّد بالذكاء الاصطناعي. راجع التغييرات قبل الدمج.</p>
</div>
</section>
</main>
<div id="sr" class="sr" role="status"></div>
</div>

<script>
const $ = id => document.getElementById(id);
const TICK = String.fromCharCode(96);
const FENCE = TICK + TICK + TICK;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let adminToken = "";
let historyMessages = [];
let busy = false;
let lastTask = "";

const ICONS = (function () {
  const s = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + d + '</svg>';
  return {
    eye: s('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: s('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    lock: s('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    logout: s('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    refresh: s('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
    plus: s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    send: s('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
    check: s('<polyline points="20 6 9 17 4 12"/>'),
    alert: s('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
    info: s('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
    copy: s('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    external: s('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
    pr: s('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>'),
    zap: s('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>')
  };
})();

const STAGES = [
  ["scan", "فحص بنية المستودع"],
  ["select", "اختيار الملفات المناسبة"],
  ["read", "قراءة الملفات"],
  ["generate", "تحليل الطلب وتوليد النتيجة"],
  ["publish", "إنشاء الفرع وPull Request"]
];

const QUICK = [
  {label: "افحص المشروع", prompt: "افحص بنية المستودع واشرح أهم الملفات والمشكلات المحتملة دون إجراء تغييرات."},
  {label: "اكتشف الأخطاء", prompt: "افحص الأخطاء المحتملة في المشروع واقترح إصلاحات محددة مع الحفاظ على الوظائف الحالية."},
  {label: "حسّن الواجهة", prompt: "حسّن تصميم الواجهة لتكون احترافية ومتجاوبة مع الهاتف مع الحفاظ على الوظائف الحالية."}
];

function icon(name) {
  const span = document.createElement("span");
  span.className = "ico";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = ICONS[name] || "";
  return span;
}

function textSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function setBanner(el, text, kind) {
  if (!text) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  el.className = "banner" + (kind ? " " + kind : "");
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.replaceChildren(icon(kind === "error" ? "alert" : kind === "ok" ? "check" : "info"), textSpan(text));
}

function setLoading(btn, on, text) {
  const label = btn.querySelector(".lbl");
  const old = btn.querySelector(".spin");
  if (on) {
    if (label && !btn.dataset.label) btn.dataset.label = label.textContent;
    if (label) label.textContent = text;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    if (!old) {
      const sp = document.createElement("span");
      sp.className = "spin";
      sp.setAttribute("aria-hidden", "true");
      btn.prepend(sp);
    }
  } else {
    if (old) old.remove();
    if (label && btn.dataset.label) label.textContent = btn.dataset.label;
    delete btn.dataset.label;
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
  }
}

function scrollChat() {
  const chat = $("chat");
  chat.scrollTo({top: chat.scrollHeight, behavior: reduceMotion.matches ? "auto" : "smooth"});
}

function autosize() {
  const t = $("task");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, Math.round(window.innerHeight * 0.36)) + "px";
}

async function swap(from, to) {
  if (reduceMotion.matches || !from.animate) {
    from.hidden = true;
    to.hidden = false;
    return;
  }
  const out = from.animate(
    [{opacity: 1, transform: "translateY(0)"}, {opacity: 0, transform: "translateY(-8px)"}],
    {duration: 160, easing: "ease-in", fill: "forwards"}
  );
  try { await out.finished; } catch (e) {}
  from.hidden = true;
  out.cancel();
  to.hidden = false;
  to.animate(
    [{opacity: 0, transform: "translateY(10px)"}, {opacity: 1, transform: "translateY(0)"}],
    {duration: 320, easing: "cubic-bezier(.22,1,.36,1)"}
  );
}

function appendInline(container, text) {
  text.split(TICK).forEach((seg, i) => {
    if (!seg) return;
    if (i % 2 === 1) {
      const c = document.createElement("code");
      c.className = "inline";
      c.textContent = seg;
      container.appendChild(c);
    } else {
      container.appendChild(document.createTextNode(seg));
    }
  });
}

function codeBlock(code) {
  const wrap = document.createElement("div");
  wrap.className = "codeblock";
  const pre = document.createElement("pre");
  const c = document.createElement("code");
  c.textContent = code;
  pre.appendChild(c);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy";
  btn.setAttribute("aria-label", "نسخ الكود");
  btn.appendChild(icon("copy"));
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      btn.replaceChildren(icon("check"));
      setTimeout(() => btn.replaceChildren(icon("copy")), 1500);
    } catch (e) {
      btn.title = "تعذر النسخ";
    }
  };
  wrap.append(pre, btn);
  return wrap;
}

function renderRich(container, text) {
  String(text).split(FENCE).forEach((part, i) => {
    if (i % 2 === 1) {
      container.appendChild(codeBlock(part.replace(/^[a-zA-Z0-9_+-]*\n/, "").replace(/\n$/, "")));
    } else {
      appendInline(container, part);
    }
  });
}

function addMessage(role, text, opts) {
  opts = opts || {};
  const welcome = $("welcome");
  if (welcome) welcome.remove();
  const root = document.createElement("div");
  root.className = "msg " + role + (opts.error ? " error" : "");
  if (opts.error) root.setAttribute("role", "alert");
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "أنت" : "F";
  const body = document.createElement("div");
  body.className = "body";
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role === "user" ? "أنت" : "Forion Agent";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant" && !opts.error) renderRich(bubble, text);
  else bubble.textContent = text;
  body.append(who, bubble);
  root.append(avatar, body);
  $("chat").appendChild(root);
  scrollChat();
  return {root: root, body: body, bubble: bubble};
}

function renderWelcome() {
  const w = document.createElement("div");
  w.className = "welcome";
  w.id = "welcome";
  const spark = document.createElement("div");
  spark.className = "spark";
  spark.appendChild(icon("zap"));
  const h = document.createElement("h2");
  h.textContent = "ماذا تريد أن نبني اليوم؟";
  const p = document.createElement("p");
  p.textContent = "اكتب طلبك بالعربية أو الإنجليزية. أحلّل ملفات المشروع، وأقترح إصلاحات، وأجهّز التغييرات في فرع مستقل مع Pull Request للمراجعة.";
  const quick = document.createElement("div");
  quick.className = "quick";
  QUICK.forEach(q => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chipbtn";
    b.textContent = q.label;
    b.onclick = () => {
      $("task").value = q.prompt;
      autosize();
      $("task").focus();
    };
    quick.appendChild(b);
  });
  w.append(spark, h, p, quick);
  $("chat").replaceChildren(w);
}

function createProgress() {
  const msg = addMessage("assistant", "");
  msg.bubble.style.whiteSpace = "normal";
  const list = document.createElement("ol");
  list.className = "steps";
  const items = {};
  STAGES.forEach(entry => {
    const li = document.createElement("li");
    li.className = "step";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.appendChild(icon("check"));
    li.append(dot, textSpan(entry[1]));
    list.appendChild(li);
    items[entry[0]] = li;
  });
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.setAttribute("aria-hidden", "true");
  const elapsed = document.createElement("div");
  elapsed.className = "elapsed";
  elapsed.textContent = "00:00";
  msg.bubble.append(list, bar, elapsed);
  const started = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    elapsed.textContent = pad(Math.floor(s / 60)) + ":" + pad(s % 60);
  }, 1000);
  const keys = STAGES.map(s => s[0]);
  return {
    update(stage, text) {
      const idx = keys.indexOf(stage);
      if (idx < 0) return;
      keys.forEach((k, i) => {
        items[k].className = "step" + (i < idx ? " done" : i === idx ? " active" : "");
      });
      $("sr").textContent = text || STAGES[idx][1];
    },
    stop() {
      clearInterval(timer);
      msg.root.remove();
    }
  };
}

async function apiGet(path) {
  let response;
  try {
    response = await fetch(path, {headers: {"X-Admin-Token": adminToken}});
  } catch (e) {
    throw new Error("تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.");
  }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) {
    throw new Error("استجابة غير صالحة من الخادم (HTTP " + response.status + ").");
  }
  if (!response.ok) throw new Error((data.error || "فشل الطلب") + " (HTTP " + response.status + ")");
  return data;
}

async function runTask(repo, task, history, onEvent) {
  let response;
  try {
    response = await fetch("/api/task", {
      method: "POST",
      headers: {"X-Admin-Token": adminToken, "Content-Type": "application/json"},
      body: JSON.stringify({repo: repo, task: task, history: history})
    });
  } catch (e) {
    throw new Error("تعذر الاتصال بالخادم قبل بدء التنفيذ. تحقق من الإنترنت ثم أعد المحاولة.");
  }

  const type = response.headers.get("Content-Type") || "";
  if (!type.includes("ndjson") || !response.body) {
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
    throw new Error((data.error || "استجابة غير متوقعة من الخادم") + " (HTTP " + response.status + ")");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final = null;

  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (e) {
      throw new Error("انقطع الاتصال أثناء التنفيذ. إن ظهر فرع جديد في GitHub فقد اكتمل جزء من العمل؛ تحقق منه ثم أعد المحاولة.");
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, {stream: true});
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let evt;
      try { evt = JSON.parse(line); } catch (e) { continue; }
      if (evt.type === "result") final = evt;
      else if (evt.type === "error") throw new Error(evt.error || "فشل التنفيذ");
      else onEvent(evt);
    }
  }
  if (!final) throw new Error("انتهى الاتصال قبل وصول النتيجة. أعد المحاولة.");
  return final;
}

function showResult(r) {
  const summary = String(r.summary || "").trim() || "اكتمل التنفيذ.";
  const m = addMessage("assistant", summary);
  if (r.noChanges) {
    historyMessages.push({role: "assistant", content: summary});
    return;
  }
  const card = document.createElement("div");
  card.className = "result";
  const head = document.createElement("div");
  head.className = "result-head";
  head.append(icon("pr"), textSpan("تم إنشاء Pull Request"));
  const chips = document.createElement("div");
  chips.className = "chips";
  const files = Array.isArray(r.files) ? r.files : [];
  ["الفرع: " + r.branch].concat(files).forEach(t => {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = t;
    chips.appendChild(c);
  });
  card.append(head, chips);
  if (typeof r.url === "string" && /^https:\/\/github\.com\//.test(r.url)) {
    const link = document.createElement("a");
    link.className = "btn btn-primary small";
    link.href = r.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(textSpan("فتح Pull Request"), icon("external"));
    card.appendChild(link);
  }
  m.body.appendChild(card);
  historyMessages.push({role: "assistant", content: summary + "\nالفرع: " + r.branch + "\nالملفات: " + files.join(", ")});
  scrollChat();
}

function showFailure(message) {
  const m = addMessage("assistant", "تعذر تنفيذ الطلب:\n" + message, {error: true});
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "btn btn-ghost small";
  retry.append(icon("refresh"), textSpan("إعادة المحاولة"));
  retry.onclick = () => {
    $("task").value = lastTask;
    autosize();
    $("task").focus();
    retry.disabled = true;
  };
  m.body.appendChild(retry);
  scrollChat();
}

async function sendMessage() {
  if (busy) return;
  const task = $("task").value.trim();
  const repo = $("repo").value;
  if (!repo) {
    setBanner($("wsStatus"), "اختر مستودعًا أولًا.", "error");
    return;
  }
  if (!task) return;

  busy = true;
  setLoading($("send"), true, "جارٍ التنفيذ");
  lastTask = task;
  setBanner($("wsStatus"), "");
  $("task").value = "";
  autosize();
  addMessage("user", task);
  const prior = historyMessages.slice(-6);
  historyMessages.push({role: "user", content: task});
  const progress = createProgress();
  progress.update("scan");

  try {
    const result = await runTask(repo, task, prior, evt => {
      if (evt.type === "stage") progress.update(evt.stage, evt.message);
    });
    progress.stop();
    showResult(result);
  } catch (error) {
    progress.stop();
    historyMessages.pop();
    showFailure(String((error && error.message) || error));
  } finally {
    busy = false;
    setLoading($("send"), false);
    $("task").focus();
  }
}

async function loadRepos() {
  const data = await apiGet("/api/repos");
  const select = $("repo");
  const previous = select.value;
  select.replaceChildren();
  (data.repos || []).forEach(item => {
    const option = document.createElement("option");
    option.value = item.full_name;
    option.textContent = item.full_name + (item.private ? " — خاص" : " — عام");
    select.appendChild(option);
  });
  if (!select.options.length) throw new Error("لا توجد مستودعات بصلاحية الكتابة لهذا الرمز.");
  if (previous) select.value = previous;
  return select.options.length;
}

async function connect() {
  const value = $("token").value.trim();
  if (!value) {
    setBanner($("status"), "أدخل رمز الإدارة أولًا.", "error");
    $("token").focus();
    return;
  }
  adminToken = value;
  setBanner($("status"), "");
  setLoading($("connect"), true, "جارٍ الاتصال…");
  try {
    const count = await loadRepos();
    renderWelcome();
    await swap($("login"), $("workspace"));
    $("logout").hidden = false;
    setBanner($("wsStatus"), "تم تحميل " + count + " مستودع.", "ok");
    setTimeout(() => setBanner($("wsStatus"), ""), 3500);
    $("task").focus();
  } catch (error) {
    adminToken = "";
    setBanner($("status"), String((error && error.message) || error), "error");
  } finally {
    setLoading($("connect"), false);
  }
}

$("connect").onclick = connect;
$("token").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    connect();
  }
});

$("toggleToken").onclick = () => {
  const input = $("token");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("toggleToken").setAttribute("aria-pressed", show ? "true" : "false");
  $("toggleToken").setAttribute("aria-label", show ? "إخفاء الرمز" : "إظهار الرمز");
  $("toggleToken").firstElementChild.innerHTML = ICONS[show ? "eyeOff" : "eye"];
};

$("refresh").onclick = async () => {
  const btn = $("refresh");
  btn.disabled = true;
  try {
    const count = await loadRepos();
    setBanner($("wsStatus"), "تم تحديث القائمة (" + count + " مستودع).", "ok");
    setTimeout(() => setBanner($("wsStatus"), ""), 3000);
  } catch (error) {
    setBanner($("wsStatus"), String((error && error.message) || error), "error");
  } finally {
    btn.disabled = false;
  }
};

$("send").onclick = sendMessage;
$("task").addEventListener("input", autosize);
$("task").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

$("clear").onclick = () => {
  if (busy) return;
  historyMessages = [];
  renderWelcome();
  setBanner($("wsStatus"), "");
};

$("logout").onclick = async () => {
  if (busy) return;
  adminToken = "";
  historyMessages = [];
  $("token").value = "";
  $("logout").hidden = true;
  setBanner($("status"), "");
  await swap($("workspace"), $("login"));
  $("token").focus();
};

document.addEventListener("visibilitychange", () => {
  document.documentElement.toggleAttribute("data-paused", document.hidden);
});

document.querySelectorAll("[data-icon]").forEach(el => {
  el.classList.add("ico");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = ICONS[el.dataset.icon] || "";
});
</script>
</body>
</html>`;
