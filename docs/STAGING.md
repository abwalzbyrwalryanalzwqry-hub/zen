# بيئة التجربة (Staging) — المرحلة 8.5

الهدف: لا يُجرَّب أي ترحيل على قاعدة الإنتاج مباشرة. كل ترحيل يمرّ بثلاث طبقات:

| الطبقة     | ما هي                                                      | من يشغّلها            |
| ---------- | ---------------------------------------------------------- | --------------------- |
| 1. محلياً  | `npm run test:db` على PostgreSQL مضمَّن + فحوص RLS         | كل طلب دمج            |
| 2. Staging | مشروع Supabase ثانٍ مجاني (`zen-staging`) بالترحيلات نفسها | قبل النشر على الإنتاج |
| 3. الإنتاج | `iniqospdljdlcfmwxafl`                                     | بعد نجاح الطبقتين     |

## إنشاء مشروع Staging (مرة واحدة)

1. من لوحة Supabase: **New project** باسم `zen-staging` في المنطقة نفسها (`ap-south-1`) والخطة المجانية.
2. انسخ `.env.staging.example` إلى `.env.staging.local` واملأ القيم من **Project Settings ← API Keys**.
3. انشر الترحيلات:

   ```sh
   npx supabase link --project-ref <staging-ref>
   npx supabase db push
   ```

4. شغّل الواجهة على Staging: `npx vite dev --mode staging` (يقرأ `.env.staging.local`).
5. بيانات تجريبية: `npm run seed:demo` مع مفتاح `service_role` لمشروع Staging فقط.

## قبل كل نشر على الإنتاج

1. `npx supabase link --project-ref <staging-ref> && npx supabase db push`.
2. دخول فعلي بحسابَي معلّم وطالب على Staging، وتجربة الميزة الجديدة.
3. مستشار الأمان في لوحة Staging (**Advisors ← Security**) بلا تحذيرات جديدة.
4. ثم `npx supabase link --project-ref iniqospdljdlcfmwxafl && npx supabase db push`.

## الاختبار الآلي على Staging (تدقيق 3.3)

سير **Staging** (يدوي، وأسبوعياً السبت 05:00 UTC فلا يتوقف المشروع المجاني) ينشر الترحيلات بـ
`supabase db push --db-url` ثم يشغّل `scripts/staging-smoke.mjs`: كلمة مرور شائعة مرفوضة، تسجيل ودخول حقيقيان
عبر GoTrue، الملف الشخصي والدور، تسجيل حفظ و`progress_stats`، RLS بلا جلسة، ودوال Edge ترفض غير المصادَق، ثم
حذف الحساب المؤقت. الأسرار في GitHub ← Settings ← Secrets:

| السر                      | القيمة                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `STAGING_DB_URL`          | رابط Session pooler لمشروع Staging (Project Settings ← Database) |
| `STAGING_SUPABASE_URL`    | `https://<staging-ref>.supabase.co`                              |
| `STAGING_PUBLISHABLE_KEY` | المفتاح العام لمشروع Staging                                     |

السير يرفض أي سرّ يشير إلى مشروع الإنتاج. محلياً: `STAGING_SUPABASE_URL=… STAGING_PUBLISHABLE_KEY=… node scripts/staging-smoke.mjs`.

## ملاحظات

- المشروع المجاني يتوقف بعد 7 أيام بلا نشاط؛ يُستأنف من اللوحة بضغطة.
- لا تنسخ بيانات الإنتاج إلى Staging (بيانات قُصَّر). استعمل `seed:demo` فقط.
- لا معاينة ويب: زِن تطبيق Android فقط. تُجرَّب الميزة بـ APK مبني على Staging (`npm run build:apk` مع
  `VITE_SUPABASE_URL` لمشروع Staging).
