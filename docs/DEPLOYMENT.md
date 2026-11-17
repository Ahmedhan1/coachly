# النشر على Cloudflare (اتعمل في 16 نوفمبر 2026)

## العناوين الثابتة (ما تتغيرش أبداً)

| الحاجة | العنوان |
| --- | --- |
| التطبيق (اللي المدرب يثبّته من Safari) | https://pt-coach.nexus-ahmed.workers.dev |
| السيرفر (التفعيل، الإشعارات، صفحة العميل، النسخ السحابي) | https://pt-coach-license.nexus-ahmed.workers.dev |
| لوحة الأكواد بتاعتك | https://pt-coach-license.nexus-ahmed.workers.dev/admin |

بيانات المدرب مربوطة بعنوان التطبيق، فما تغيّرش اسم الـ Worker `pt-coach` ولا الـ subdomain.

## اللي اتعمل

- Worker اسمه `pt-coach-license` بـ cron كل دقيقة للإشعارات.
- قاعدة D1 اسمها `pt-coach-licenses` (id: `902382d0-8155-4203-89be-bae9c3f9d908`) والجداول من `worker/migrations`.
- الأسرار متسجلة في Cloudflare: `LICENSE_PRIVATE_KEY`، `ADMIN_PASSWORD`، `DATA_KEY`، `VAPID_PRIVATE_KEY`،
  `VAPID_PUBLIC_KEY`، `VAPID_SUBJECT`. المفتاح العام موجود في `src/services/license/publicKey.ts` و `worker/wrangler.toml`.
- التطبيق Worker اسمه `pt-coach` بيخدم ملفات التطبيق من قاعدة D1 اسمها `pt-coach-app` (الكود في `deploy/app/`).
  اتعمل كده بدل «Static Assets» لأن رفع الملفات بالطريقة العادية محتاج توكن رفع خاص ما كانش ينفع من بيئة الشغل.
  التطبيق بيتخزن على الموبايل بعد أول فتح، فالقاعدة بتتقري نادراً.

## مطلوب منك مرة واحدة: تفعيل R2

النسخة السحابية وصفحة العميل محتاجين R2، وCloudflare بيطلب تفعيله من الداشبورد (حتى على الباقة المجانية):

1. ادخل dash.cloudflare.com ← R2 ← Enable (ممكن يطلب وسيلة دفع، والاستخدام في حدود الـ 10 جيجا مجاني).
2. قولّي «فعّلت R2» وأنا أعمل الـ bucket `pt-coach-backups` وأرفع الـ Worker بالإعداد الكامل. أو بنفسك:
   `cd worker && npx wrangler r2 bucket create pt-coach-backups && npx wrangler deploy`

لحد ما ده يحصل، السيرفر بيرد على النسخ السحابي وصفحة العميل بـ «storage_unavailable» والتطبيق بيكمل عادي بالنسخة المحلية.

## إصدار كود لمدرب

افتح لوحة الأكواد، ادخل كلمة السر، اكتب اسم المدرب والمدة، وخد الكود (12 حرف). المدرب يفتح عنوان التطبيق في Safari،
يضيفه للشاشة الرئيسية، ويكتب الكود.

## تحديث التطبيق بعد أي تعديل

```bash
VITE_WORKER_URL=https://pt-coach-license.nexus-ahmed.workers.dev npm run build
```

```bash
UPLOAD_KEY=<مفتاح الرفع> python3 deploy/app/upload.py
```

السكربت بيرفع الملفات اللي اتغيرت بس. مفتاح الرفع (`UPLOAD_KEY`) سر في Worker `pt-coach` واتسلّملك مع باقي المفاتيح.
لو غيّرت كود `deploy/app/src/index.ts` نفسه: `cd deploy/app && npx --prefix ../../worker wrangler deploy`.

## اتجرّب على السيرفر الحقيقي (16 نوفمبر)

- التطبيق بيفتح وصفحة التثبيت بتظهر، والـ service worker شغال، وبيفتح من غير نت.
- لوحة الأكواد: تسجيل دخول وإصدار كود اشتغلوا. الكود اتفعّل من التطبيق ووصل لإعداد الهوية، ونفس الكود اترفض على جهاز تاني (`used`). الترخيص التجريبي اتلغى بعدها.
- مفتاح الإشعارات بيرجع من `/api/push/vapid`، والتطبيق بيكلم السيرفر من غير مشاكل CORS.

## المفاتيح الخاصة

المفتاح الخاص للتراخيص وكلمة سر اللوحة ومفاتيح الإشعارات اتسلّموا ليك خارج الريبو. خد منهم نسخة أوفلاين
(فلاشة أو ورقة). المفتاح الخاص هو اللي بتستخدمه أداة `tools/sign-offline-code.mjs` لما Cloudflare يكون واقع.
لو ضاع، كل التراخيص الجديدة محتاجة مفتاح جديد ونسخة جديدة من التطبيق.

## Security headers and updates (app Worker)

- Every response from `deploy/app` carries the CSP, Permissions-Policy, HSTS and anti-framing headers defined in
  `shared/appHeaders.ts`. `vite preview` sends the same headers, so e2e runs under the real policy. If a new
  feature needs another origin (a CDN, a new API), change it there, and test with zero `Refused to …` lines.
- `deploy/app/upload.py` uploads `index.html`, `sw.js` and the manifest **last**, so a phone checking for an update
  mid-deploy never gets a new service worker whose files are missing. Old hashed assets are never deleted.
- A new version does not take over an open app by itself: the trainer sees «فيه نسخة جديدة» and taps update,
  or it activates on the next cold start (`src/app/swUpdate.ts`).
