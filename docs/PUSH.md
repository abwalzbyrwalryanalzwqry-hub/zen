# الإشعارات الفورية (FCM، Android فقط)

زِن تطبيق Android فقط (6.10): الإشعارات كلها عبر Firebase Cloud Messaging، ولا Web Push ولا VAPID.

## كيف تعمل

1. كل صف يُدرج في `notifications` (واجب، تقييم، غياب لولي الأمر، إعلان غرفة، وسام…) يمرّ على المشغّل
   `enqueue_push`، فيضع نسخة في `push_outbox` إن كان عند المستخدم جهاز مسجَّل وسمحت تفضيلاته بالفئة، مع
   تأجيلها إلى نهاية ساعات الهدوء.
2. `enqueue_daily_reminders()` تضيف تذكير الورد والمحاسبة مرة في اليوم لمن ضبط وقتهما (بتوقيته المحلي).
3. `claim_push_batch()` تحجز دفعة، والدالة ترسلها إلى رموز FCM، ثم `finish_push()` تختم المُسلَّم وتحذف
   الرموز المنتهية (`UNREGISTERED`/404). اشتراكات متصفح قديمة إن بقيت في `push_subscriptions` تُتجاهل. بعد 5 محاولات يُترك الصف، ويُنظَّف بعد 7 أيام.

الإرسال يجري في دالة Supabase Edge `zen-push-dispatch` (المرحلة 6.4) من موضعين:
فوراً بعد فعل المعلّم (`kickPushSoon` بجلسة المستخدم، دفعة صغيرة)، وبالمجدول كل دقيقة لما تأجّل
وللتذكيرات اليومية. الدوال الثلاث للخادم وحده (`service_role`).

## التفعيل (مرة واحدة)

ضع في أسرار دوال Supabase (Project Settings ← Edge Functions ← Secrets):

| المتغيّر               | القيمة                                        |
| ---------------------- | --------------------------------------------- |
| `FCM_SERVICE_ACCOUNT`  | JSON حساب خدمة Firebase في سطر واحد (قسم FCM) |
| `PUSH_DISPATCH_SECRET` | سلسلة عشوائية طويلة                           |

ثم انشر الدالة `supabase functions deploy zen-push-dispatch --no-verify-jwt` (تتحقق بنفسها من السرّ أو
من جلسة المستخدم)، وفعّل `pg_cron` و`pg_net` من Database → Extensions، وطبّق الترحيل
`20261014100000_push_dispatch_cron` (يجدول `push_dispatch_tick()` كل دقيقة). وأخيراً في SQL Editor:

```sql
-- السرّ والرابط في Supabase Vault فلا يظهران في نص المهمة (cron.job).
select vault.create_secret('https://<ref>.supabase.co/functions/v1/zen-push-dispatch', 'zen_push_dispatch_url');
select vault.create_secret('<PUSH_DISPATCH_SECRET>', 'zen_push_dispatch_secret');
```

النبضة تضيف تذكيرات اليوم داخل القاعدة، ولا تنادي الدالة إلا إن كان في `push_outbox` شيء مستحق. تحقق
بـ `select public.push_dispatch_tick();` (`idle` أو `queued`؛ و`not_configured` إن غابت الأسرار).

بلا مجدول تصل إشعارات أفعال المعلّم فوراً، ولا تصل التذكيرات اليومية ولا ما تأجّل بسبب ساعات الهدوء.

## تسجيل الجهاز وFCM

يُسجَّل الجهاز في Firebase Cloud Messaging ويُحفظ رمزه في
`native_push_tokens` عبر `save_native_push_token` (ينقل الرمز للمستخدم الحالي إن سُجّل على الجهاز
حساب آخر قبله). المرسِل نفسه (`dispatchPush` في `push-core.ts`) يأخذ من `claim_push_batch` الرموز الأصلية
ويرسلها عبر FCM HTTP v1 (`src/lib/fcm.server.ts`، ونسخته في `_shared`: JWT موقَّع RS256 بـ
WebCrypto، ورمز وصول مخزَّن ساعة). الرمز الذي يردّ عليه FCM بـ `UNREGISTERED`/404 يُحذف.

| المتغيّر              | أين      |
| --------------------- | -------- |
| `FCM_SERVICE_ACCOUNT` | خادم فقط |

قيمته محتوى ملف JSON لحساب الخدمة من Firebase Console ← Project settings ← Service accounts ←
Generate new private key (سطر واحد). لا يبدأ أبداً بـ `VITE_`. إن غاب تُرجع الدالة 503 ولا تلمس الصندوق.

### التسجيل التلقائي والقناة الموحّدة (1.16.1)

- `src/lib/notify/device.ts` مصدر واحد: بعد الدخول (`_authed.tsx`) يُطلب الإذن **مرة واحدة** في عمر التثبيت
  ويُسجَّل الجهاز، ثم يُتحقق منه عند كل تشغيل دون سؤال. مستمع دائم لـ `registration` يحفظ كل رمز جديد من FCM.
  إيقاف المستخدم من الإعدادات يُحفظ (`zen.push.optout`) فلا يعيده التشغيل؛ والخروج يحذف الرمز دون إيقاف.
- قناة Android واحدة `zen-default` بأهمية عالية واهتزاز وضوء و**بلا صوت مخصص** (صوت الجوال الافتراضي)، تُنشأ عند
  كل تشغيل. الحمولة (`fcmPayload`) بـ `default_sound` و`default_vibrate_timings` و`PRIORITY_HIGH` و`PUBLIC`،
  وبلا `tag` (كان الوسم هو الفئة فيستبدل كل إشعار سابقه).
- التطبيق مفتوح: إضافة Capacitor تعرض الإشعار في الشريط بصوته (`presentationOptions`)، و`pushNotificationReceived`
  يحدّث العدّادات وقائمة الإشعارات (`zen:push`).
- «الإعدادات ← التنبيهات»: حالة الجهاز الحقيقية (مفعّلة/موقوفة/الإذن مرفوض/القناة مطفأة)، وزر إعدادات الجوال
  (`ZenSystem.openNotificationSettings`)، و«الصوت والاهتزاز»، و«إرسال إشعار تجريبي» (`send_test_push`: لمن له جهاز،
  يُرسل الآن متجاوزاً ساعات الهدوء، مرة كل 30 ثانية).
- التشخيص على الإنتاج: `gh workflow run db-verify.yml -f check=push-diagnose` (قراءة فقط: الرموز والصندوق والمهمة).

النقر على الإشعار يفتح مساره داخل التطبيق فقط (`safeInternalPath` يرفض أي رابط خارجي).

## الخصوصية

- رمز FCM مرتبط بالحساب (`user_id`)، فيشملهما التصدير والحذف.
- مواقيت الصلاة تُحسب على الجهاز (adhan-js)، والموقع يبقى في `localStorage` مقرَّباً إلى نحو كيلومتر.
- نص الإشعار الفوري هو عنوان الإشعار ونصّه كما في التطبيق، والرابط مسار داخلي فقط.
