// المهارات المدمجة. تظهر في لوحة الإعدادات ويمكن تعطيلها أو جعلها دائمة أو نسخها وتعديلها.
// الوسوم تعمل ككلمات تفعيل (بالإنجليزية والعربية). الأوضاع: auto | always | off.

export const BUILTIN_SKILLS = Object.freeze([
  {
    id: "code-review",
    name: "Code Review",
    description: "مراجعة الكود واكتشاف الأخطاء والمشاكل المحتملة",
    tags: ["review", "bug", "bugs", "audit", "code-quality", "مراجعة", "اخطاء", "خطا", "مشاكل"],
    mode: "auto",
    instructions: [
      "Review the provided code for correctness before proposing changes.",
      "Look for: undefined variables, wrong imports or paths, unhandled promise rejections, off-by-one errors, missing null checks, race conditions, and dead code.",
      "Fix the root cause with the smallest safe change. Do not refactor unrelated code.",
      "Explain each fix briefly in the summary (what was wrong, why the change is correct)."
    ].join("\n")
  },
  {
    id: "security",
    name: "Security Review",
    description: "فحص الثغرات والأسرار والمدخلات غير الموثوقة",
    tags: ["security", "vulnerability", "vulnerabilities", "xss", "csrf", "injection", "امن", "امان", "ثغرات", "ثغره", "حماية"],
    mode: "auto",
    instructions: [
      "Treat all external input as untrusted: validate, normalize, and encode it.",
      "Never hard-code secrets or log them. Do not weaken authentication, CORS, CSP or permission checks.",
      "Prefer constant-time comparison for secrets, parameterized queries, and safe DOM APIs (textContent instead of innerHTML).",
      "If you find a vulnerability, fix it and mention it clearly in the summary."
    ].join("\n")
  },
  {
    id: "performance",
    name: "Performance",
    description: "تحسين الأداء وتقليل الطلبات والحجم",
    tags: ["performance", "optimize", "optimization", "slow", "speed", "اداء", "تحسين الاداء", "بطيء", "سرعة"],
    mode: "auto",
    instructions: [
      "Measure by reasoning before optimizing: find the real bottleneck (network round trips, repeated work, large payloads, blocking loops).",
      "Prefer batching, caching, and parallel requests over micro-optimizations.",
      "Keep behavior identical; do not trade correctness or readability for tiny gains."
    ].join("\n")
  },
  {
    id: "testing",
    name: "Testing",
    description: "كتابة اختبارات واضحة وسريعة",
    tags: ["test", "tests", "testing", "unit-test", "coverage", "اختبار", "اختبارات", "تغطية"],
    mode: "auto",
    instructions: [
      "Write tests with the framework the repository already uses (check package.json scripts). Do not add new test dependencies unless asked.",
      "Cover the normal path, edge cases, and failure paths. Keep each test small and independent, with descriptive names.",
      "Do not call real networks or services in tests; use fakes or mocks."
    ].join("\n")
  },
  {
    id: "refactor",
    name: "Refactoring",
    description: "إعادة هيكلة الكود وتنظيم الملفات دون تغيير السلوك",
    tags: ["refactor", "refactoring", "cleanup", "restructure", "reorganize", "اعادة هيكلة", "تنظيف", "ترتيب", "تنظيم"],
    mode: "auto",
    instructions: [
      "Preserve behavior exactly. Move or rename files only when it clearly improves structure, and update every import that references them.",
      "Remove dead code only after confirming nothing imports or calls it.",
      "Use small focused modules with one responsibility each; keep names consistent with the existing style."
    ].join("\n")
  },
  {
    id: "cloudflare-workers",
    name: "Cloudflare Workers",
    description: "قواعد تطوير Workers وD1 وKV وR2",
    tags: ["cloudflare", "worker", "workers", "wrangler", "d1", "kv", "r2", "durable"],
    mode: "auto",
    instructions: [
      "Code runs on the Workers runtime: use Web APIs (fetch, Request, Response, crypto.subtle, TextEncoder); no Node-only modules unless nodejs_compat is enabled.",
      "Respect limits: subrequest count, CPU time, and memory. Stream large responses and use ctx.waitUntil for background work.",
      "Keep secrets in environment bindings, never in source. Keep wrangler.toml valid and bindings consistent with the code.",
      "Use prepared statements with bound parameters for D1."
    ].join("\n")
  },
  {
    id: "ui-design",
    name: "UI Design",
    description: "واجهات عربية متجاوبة وسهلة الوصول",
    tags: ["ui", "ux", "design", "css", "responsive", "accessibility", "واجهة", "تصميم", "متجاوب", "جوال"],
    mode: "auto",
    instructions: [
      "Build mobile-first, RTL-aware layouts using logical CSS properties (margin-inline, inset-inline) and relative units.",
      "Keep touch targets at least 44px, contrast readable, and focus states visible. Respect prefers-reduced-motion.",
      "Reuse the existing design tokens and components; do not introduce a new visual language.",
      "Never insert untrusted text with innerHTML."
    ].join("\n")
  },
  {
    id: "documentation",
    name: "Documentation",
    description: "توثيق واضح للمشروع والكود",
    tags: ["docs", "documentation", "readme", "comment", "comments", "توثيق", "شرح", "تعليقات"],
    mode: "auto",
    instructions: [
      "Write concise, accurate documentation that matches the code as it is now; never document behavior that does not exist.",
      "README: purpose, setup, configuration, commands, and structure. Comments: explain why, not what.",
      "Use the language of the existing documentation."
    ].join("\n")
  }
]);
