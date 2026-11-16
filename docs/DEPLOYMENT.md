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
- التطبيق اترفع كـ Worker ملفات ثابتة اسمه `pt-coach` (الإعداد في `deploy/app/wrangler.toml`).

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
cd deploy/app && npx --prefix ../../worker wrangler deploy
```

## المفاتيح الخاصة

المفتاح الخاص للتراخيص وكلمة سر اللوحة ومفاتيح الإشعارات اتسلّموا ليك خارج الريبو. خد منهم نسخة أوفلاين
(فلاشة أو ورقة). المفتاح الخاص هو اللي بتستخدمه أداة `tools/sign-offline-code.mjs` لما Cloudflare يكون واقع.
لو ضاع، كل التراخيص الجديدة محتاجة مفتاح جديد ونسخة جديدة من التطبيق.
