# Forion Agent

مساعد برمجي يعمل على Cloudflare Workers: يقرأ ملفات مستودع GitHub، ويولّد التعديلات عبر Workers AI، ثم ينشئ فرعًا وPull Request للمراجعة.

## خط المعالجة

فحص المستودع ← اختيار الملفات ← قراءة ← توليد ← نشر (فرع + PR).

- طلبات الشرح والتحليل لا تُنشئ PR. وعند كتابة «دون تغييرات» أو `without making any changes` في الطلب لا يُنشأ فرع أبدًا.
- إنشاء ملفات جديدة لا يُسمح به إلا بطلب صريح (حتى 3 ملفات).
- الملفات الأكبر من 24KB، وملفات الأسرار و`.github/workflows` والـ lockfiles، مستثناة من القراءة والتعديل.

## الحدود

| الحد | القيمة |
| --- | --- |
| طول الرسالة | 50000 حرف (الخادم والواجهة) |
| ملفات التحليل | 8 ملفات، 70KB إجمالًا |
| الملف الواحد | 24KB |

كل الحدود في `src/config.js`.

## الإعداد

الأسرار (في Cloudflare أو `.dev.vars` محليًا، راجع `.dev.vars.example`):

- `ADMIN_TOKEN`: رمز الدخول إلى الواجهة.
- `GITHUB_TOKEN`: رمز GitHub بصلاحية الكتابة على المستودعات المطلوبة.

المتغيرات في `wrangler.toml`:

- `MODEL`: نموذج Workers AI.
- `AUTO_MERGE`: `"false"` افتراضيًا. لا تفعّله قبل تفعيل Allow auto-merge وحماية الفرع مع فحوصات مطلوبة.

## التشغيل والاختبار

```bash
npm run dev     # wrangler dev
npm test        # node --test tests/*.test.js
npm run deploy
```

يشغّل الـ CI الأمر `npm test` وفحص صياغة JS وJSON على كل Pull Request.
