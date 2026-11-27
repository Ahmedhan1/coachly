# النشر على Cloudflare

## العناوين الثابتة (ما تتغيرش أبداً)

| الحاجة | العنوان |
| --- | --- |
| التطبيق (اللي المدرب يثبّته من Safari) | https://app.getcoachly.workers.dev |
| السيرفر (حسابات المدربين، الإشعارات، صفحة العميل، النسخ السحابي) | https://api.getcoachly.workers.dev |
| لوحة الحسابات بتاعتك (الموافقة على المدربين) | https://api.getcoachly.workers.dev/admin |

بيانات المدرب مربوطة بعنوان التطبيق، فما تغيّرش اسم الـ Worker `pt-coach` ولا الـ subdomain.

## الوضع الحالي (اتحدّث 26 نوفمبر 2026)

| الحاجة | الحالة |
| --- | --- |
| Worker `coachly-api` | النسخة الجديدة: حسابات (better-auth)، جيمات وخطط، نسخ سحابي، إشعارات، صور العملاء. Smart Placement (بيشتغل جنب قاعدة البيانات) |
| D1 `pt-coach-licenses` | كل الـ migrations اتطبقت (لحد `0006_teams`). جدول الأكواد القديم اتشال (اتعمل منه نسخة قبلها) |
| R2 `pt-coach-backups` | النسخ السحابية + صفحات العملاء + **صور العملاء** (تحت `files/`) — كله ضمن الـ 10 جيجا المجانية |
| Worker `pt-coach` (التطبيق) | بيخدم الملفات من D1 `pt-coach-app` مع كاش على حافة Cloudflare لمدة سنة للملفات الثابتة |
| الأسرار | `ADMIN_PASSWORD`، `BETTER_AUTH_SECRET`، و3 مفاتيح الإشعارات. الأسرار القديمة (`LICENSE_PRIVATE_KEY`، `DATA_KEY`) اتمسحت |

اتجرّب على السيرفر الحقيقي: عمل حساب، دخول، «حسابك مستني الموافقة» في التطبيق نفسه، ومفيش أخطاء في الكونسول.
وقت المعالج (CPU) لكل طلب 1–5 ملّي ثانية (الحد المجاني 10).

## النشر الأوتوماتيك (كل push على main)

`.github/workflows/deploy.yml` بيشغّل `npm run deploy` على GitHub Actions مع كل push على `main` (وتقدر تشغّله
بإيدك من تبويب Actions ← Deploy ← Run workflow). لو أي اختبار فشل، مفيش حاجة بتتنشر.

مرة واحدة بس: في GitHub ← المستودع ← Settings ← Secrets and variables ← Actions ← New repository secret:
`CLOUDFLARE_API_TOKEN` (ولو التوكن شايف أكتر من حساب Cloudflare، ضيف `CLOUDFLARE_ACCOUNT_ID` كمان).

## إزاي ترفع نسخة جديدة (أمر واحد)

```
npm run deploy
```

بيعمل بالترتيب: كل الاختبارات ← بناء التطبيق ← يتأكد إن البناء رايح للسيرفر الصح ← migrations ← يرفع الـ Worker ←
يرفع التطبيق (الملفات اللي اتغيرت بس). محتاج `CLOUDFLARE_API_TOKEN` (توكن API، مش الـ Global Key).

### أسرع وضع للتطبيق: Static Assets (اختياري، من كمبيوتر عادي)

Cloudflare يقدر يخدم ملفات التطبيق من غير ما الـ Worker يشتغل خالص (أسرع ومجاني بلا حدود). خطوة الرفع دي ما بتنفعش
من بيئة الشغل السحابية (البروكسي بيغيّر هيدر التوثيق)، فتتعمل من كمبيوتر عادي:

```
npm run build
cd deploy/app
npx wrangler deploy -c wrangler.assets.toml
```

وترجع لوضع D1 في أي وقت بـ `npm run deploy`.

## نسخة من قواعد البيانات قبل تحديث 26 نوفمبر

اتاخدت قبل الـ migrations: `pt-coach-licenses` كاملة (23 ترخيص قديم، سجل الأدمن، فهرس النسخ والصفحات) وجداول
الأيقونات من `pt-coach-app`. لو احتجتها اطلبها من المبرمج (اتحفظت برّه المستودع لأنها فيها بيانات).

## المفاتيح والأسرار

- كلمة سر اللوحة (`ADMIN_PASSWORD`) ومفاتيح الإشعارات معاك من قبل. خد منها نسخة أوفلاين.
- `BETTER_AUTH_SECRET` اتعمل عشوائي واتحط في Cloudflare على طول (محدش شافه). ما تغيّروش إلا لو اتسرّب:
  تغييره بيخرّج كل المدربين من السحابة (التطبيق نفسه بيفضل شغال).
- مفتاح رفع التطبيق (`UPLOAD_KEY`) بيتعمل جديد مع كل `npm run deploy`، فمش محتاج تحفظه.

## Security headers and updates (app Worker)

- Every response from `deploy/app` carries the CSP, Permissions-Policy, HSTS and anti-framing headers defined in
  `shared/appHeaders.ts`. `vite preview` sends the same headers, so e2e runs under the real policy. If a new
  feature needs another origin (a CDN, a new API), change it there, and test with zero `Refused to …` lines.
- `deploy/app/upload.py` uploads `index.html`, `sw.js` and the manifest **last**, so a phone checking for an update
  mid-deploy never gets a new service worker whose files are missing. Old hashed assets are never deleted.
- A new version does not take over an open app by itself: the trainer sees «فيه نسخة جديدة» and taps update,
  or it activates on the next cold start (`src/app/pwa/swUpdate.ts`).
