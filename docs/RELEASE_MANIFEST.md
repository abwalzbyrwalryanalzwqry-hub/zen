# بيان الإصدار

| البند                  | القيمة                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| التطبيق                | زِن — رفيقك في حفظ القرآن (**Android فقط**، لا تطبيق ويب ولا iOS)                         |
| الإصدار                | `1.5.0` (من عنوان CHANGELOG، ويطابقه `package.json` و`android/app/build.gradle`)          |
| معرّف الحزمة           | `app.zen.quran` · minSdk 24 · targetSdk 36 · Capacitor 8                                  |
| `versionCode`          | في CI = رقم التشغيل + 100 (`android-release.yml`)؛ القيمة في `build.gradle` للبناء المحلي |
| الوسم المطلوب          | `v1.5.0` (يجب أن يطابق CHANGELOG وإلا يفشل سير الإصدار)                                   |
| مشروع Supabase         | `iniqospdljdlcfmwxafl`                                                                    |
| الترحيلات              | 70 ترحيلاً في `supabase/migrations`، آخرها `20261108100000_private_predicates_2.sql`      |
| دوال Edge              | `zen-ai` · `zen-tools` · `zen-recitation` · `zen-push-dispatch`                           |
| إصدار محرّك الاختبارات | `exam-engine/1.0.0`                                                                       |
| بصمة المتن (SHA-256)   | `91cfd9f68a712f79da3ecc63c13b165345c5f284ad3e128b64fdeeac34ce748d`                        |
| نسخة المصحف            | `quran-uthmani` — 114 سورة · 6236 آية · 30 جزءاً، و604 صفحة مصوّرة مضمَّنة دون اتصال      |
| اللغات                 | العربية (افتراضية) · الإنجليزية                                                           |
| التقنيات               | React 19 · Vite 8 · Tailwind 4 · Capacitor 8 · Supabase (Postgres + Edge Functions) · FCM |

## صلاحيات Android

| الصلاحية                                    | السبب                                                          |
| ------------------------------------------- | -------------------------------------------------------------- |
| `INTERNET`                                  | Supabase ودوال Edge فقط                                        |
| `RECORD_AUDIO` · `MODIFY_AUDIO_SETTINGS`    | التسميع والرسائل الصوتية، وقت أول تسجيل                        |
| `POST_NOTIFICATIONS`                        | إشعارات FCM (Android 13+)                                      |
| `ACCESS_COARSE_LOCATION`                    | زر «موقعي» لمواقيت الصلاة، اختياري، والموقع لا يغادر الجهاز    |
| `ACCESS_FINE_LOCATION` (`maxSdkVersion=30`) | للغرض نفسه حتى Android 11 فقط، لأن الغلاف يطلب الصلاحيتين معاً |

ميزات الموقع معلَّمة `required="false"` فلا يُستبعد جهاز بلا GPS من المتجر. ماسح QR يستعمل Google Code Scanner
فلا يحتاج صلاحية الكاميرا.

## الفحوص عند الإصدار

تُشغَّل كلها في `ci.yml` (تحتاج تفعيل Actions — U1). آخر نتيجة محلية موثَّقة في `docs/PROJECT_STATUS.md`.

| الفحص                    | الأمر                                             |
| ------------------------ | ------------------------------------------------- |
| الأنواع والجودة          | `npm run typecheck` · `npm run lint`              |
| الوحدات                  | `npm run test:unit`                               |
| قاعدة البيانات           | `npm run test:db` (حتى الفحص 118)                 |
| تطابق الأنواع مع الترحيل | `npm run check:types-fresh`                       |
| الحزمة وحجمها            | `npm run build` · `npm run check:bundle`          |
| E2E (Pixel 7)            | `npm run test:e2e`                                |
| الحمل (500 طالب)         | `npm run test:load` (لوحة المركز ≈ 54 مللي ثانية) |

## قبل الوسم

قائمة الإطلاق الحرجة في [`docs/LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md). لا يُوسَم `v1.5.0` قبل إكمال
بنودها المانعة.

## لم يُنفَّذ بعد

- التحقق على جهاز فعلي: **NOT PERFORMED** (الإشعار والتطبيق مغلق، الميكروفون، المصحف في وضع الطيران،
  الودجت، ماسح QR، زر «موقعي»).
- بناء AAB موقَّع: **BLOCKED** على U1 وU8.
- iOS: **DEFERRED** بقرار المالك.
