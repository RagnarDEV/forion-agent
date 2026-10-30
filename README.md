# Forion Agent

مساعد برمجي يعمل على Cloudflare Workers: يستكشف مستودع GitHub، ويولّد التعديلات عبر Workers AI، ثم ينشئ فرعًا وPull Request للمراجعة، وينتظر فحوصات CI ويصلحها ذاتيًا عند فشلها.

## خط المعالجة

```
فحص ← استكشاف (اختياري) ← اختيار ← قراءة ← توليد ← نشر ← فحص CI وإصلاح (اختياري)
```

- **الاستكشاف الذكي**: حلقة متعددة الخطوات يستدعي فيها النموذج أدوات: `search_code` و`read_file` و`list_dir` و`list_issues` و`get_issue` و`get_pull_request`، و`add_comment` فقط عندما تطلب تعليقًا صراحةً (حد 3 تعليقات).
- **التوليد**: حتى 4 محاولات افتراضيًا (تُضبط 1–8). كل رفض (JSON تالف، edit لا يطابق، ملف مقتطع…) يُعاد للنموذج مع السبب ليصحح نفسه.
- **التعديل الجزئي**: الملفات الأكبر من 24KB تُعدَّل بـ `edits` (`search`/`replace` فريد ومطابق حرفيًا) بدل إعادة كتابتها. الحد الأقصى للملف 400KB.
- **عمليات الملفات**: إنشاء (حتى 100) وحذف ونقل ضمن Pull Request واحد.
- **فحص CI والإصلاح الذاتي**: بعد إنشاء الـ PR ينتظر فحوصات GitHub؛ عند الفشل يقرأ السجل ويضيف commit إصلاح (حتى 4 جولات، الافتراضي 2). لا يدمج شيئًا.
- **قراءة فقط**: عند كتابة «دون تغييرات» أو `read-only` أو `without making any changes` لا يُنشأ فرع ولا PR.

## الواجهة

- **الإعدادات** (زر ⚙): تفعيل الاستكشاف وفحص CI والإنشاء/الحذف، وعدد المحاولات والإصلاحات، ومعلومات الخادم.
- **المهارات**: تعليمات إضافية للنموذج. مدمجة (تُنسخ وتُعدَّل) ومخصصة (إضافة/تعديل/حذف/استيراد/تصدير JSON). أوضاع التفعيل: تلقائي (بكلمات التفعيل) · دائم · معطّل. تُحفظ في المتصفح وتُرسل مع كل طلب.
- **زر الإيقاف** أثناء المهمة.
- **رمز الإدارة**: لصق من الحافظة مع تنظيف تلقائي (مسافات، اقتباس، `Bearer`)، «تذكّرني على هذا الجهاز» (30 يومًا)، ودخول تلقائي.
- **تطبيق ويب قابل للتثبيت (PWA)**: مانيفست وService Worker وأيقونات تُولَّد من الخادم (`/icons/*.png`). يُثبَّت من الإعدادات ← الحساب.

## الحدود

كل الحدود في `src/config.js`: الرسالة 50000 حرف، السجل 16 رسالة (حتى 120000 حرف)، 12 ملفًا للتحليل (240KB)، ومهلة توليد 10 دقائق للمحاولة وسقف كلي 30 دقيقة للمهمة.

## الإعداد

الأسرار (في Cloudflare أو `.dev.vars` محليًا، راجع `.dev.vars.example`):

- `ADMIN_TOKEN`: رمز الدخول. يمكن وضع عدة رموز (سطر أو فاصلة) لتدوير الرمز دون انقطاع. يُقبل في `X-Admin-Token` أو `Authorization: Bearer`، وبعد 8 محاولات خاطئة يُحظر العنوان 10 دقائق.
- `GITHUB_TOKEN`: رمز GitHub (Fine-grained) بالصلاحيات: Contents وPull requests وIssues (Read and write)، وActions وChecks (Read)، وMetadata (Read). أضف **Workflows (Read and write)** إن أردت أن يعدّل الوكيل `.github/workflows`.

المتغيرات في `wrangler.toml`:

- `MODEL`: نموذج Workers AI.
- `AUTO_MERGE`: `"false"` افتراضيًا. لا تفعّله قبل تفعيل Allow auto-merge وحماية الفرع مع فحوصات مطلوبة.

## الأوامر

```bash
npm run dev      # wrangler dev
npm test         # node --test tests/*.test.js
npm run deploy
```

## هيكل المشروع

```
src/
  index.js            توجيه الطلبات والأيقونات
  config.js           كل الحدود والمهل
  routes/             repos · task · skills · icons
  lib/                ai · auth · github · history · intent · options · paths · png · security · stream …
  pipeline/           scan · explore · select · read · generate · patch · publish · verify
  skills/             registry · context · builtin
  tools/              github-tools (أدوات الاستكشاف)
public/               الواجهة (index.html · css/ · js/ · sw.js · manifest.webmanifest)
tests/                node:test (بما فيها اختبار استيراد كل الوحدات)
.github/workflows/    agent-check.yml (اختبارات + صياغة)
```

## CI

`.github/workflows/agent-check.yml` يشغّل `npm test` وفحص صياغة JS وJSON على كل Pull Request. اسم الفحص يظهر للوكيل عند قراءة السجلات.
