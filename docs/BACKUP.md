# النسخ الاحتياطي لقاعدة البيانات — المرحلة 6.9

الخطة المجانية في Supabase بلا نسخ احتياطية قابلة للتنزيل، والمشروع يتوقف بعد أسبوع بلا نشاط. لذلك
يأخذ سير العمل `db-backup.yml` في مستودع التشغيل الخاص **zen-ops** (لا في المستودع العام: سجلاته ومرفقاته عامة هناك) نسخة يومية (03:30 بتوقيت صنعاء، أو يدوياً):

- `pg_dump` بصيغة custom مضغوطة لمخططات `public` و`private` و`auth` و`storage` (البيانات الوصفية للملفات؛
  ملفات التسجيلات نفسها في التخزين ولا تدخل النسخة). `private` فيه دوال RLS المساعدة و`common_passwords`؛
  أُضيف بعد أول تجربة استعادة (2026-10-03) إذ كان غيابه يُسقط ~70 سياسة وجدول `certificates`.
- مشفَّرة بـ [age](https://age-encryption.org) بالمفتاح العام وحده، فلا يستطيع GitHub ولا من يملك
  المرفق قراءتها دون المفتاح الخاص.
- مرفق للتشغيل 30 يوماً مع `SHA256SUMS`. النسخة الأصغر من 10 كيلوبايت تُفشل التشغيل (تفريغ فارغ).
- كل تشغيل ناجح يُعدّ نشاطاً على المشروع أيضاً.
- **منذ تدقيق أكتوبر 2026:** غياب `SUPABASE_DB_URL` أو `BACKUP_AGE_RECIPIENT` يُفشل التشغيل (أحمر). كان
  تحذيراً فقط، فظهرت التشغيلات «ناجحة» أسابيع دون أي نسخة.
- بعد النسخة يقارن التشغيل الترحيلات في المستودع بالمنشور على الإنتاج
  (`scripts/check-migrations-deployed.mjs`) ويكتب الفروق في ملخّصه.

## الإعداد مرة واحدة (المالك: U8)

1. مفتاحا age على جهازك (لا في GitHub):

   ```bash
   age-keygen -o zen-backup.key     # يطبع: Public key: age1...
   ```

   احفظ `zen-backup.key` في مكانين آمنين خارج الجهاز (مدير كلمات مرور وقرص خارجي). فقدانه يعني فقدان
   كل النسخ.

2. في GitHub ← Settings ← Secrets and variables ← Actions:

   | الاسم                  | النوع    | القيمة                                                               |
   | ---------------------- | -------- | -------------------------------------------------------------------- |
   | `SUPABASE_DB_URL`      | Secret   | Supabase ← Connect ← Session pooler (المنفذ 5432) بكلمة مرور القاعدة |
   | `BACKUP_AGE_RECIPIENT` | Variable | المفتاح العام `age1...`                                              |

3. Actions ← «نسخة احتياطية لقاعدة البيانات» ← Run workflow، وتأكد من ظهور المرفق وحجمه في الملخّص.

## الاستعادة (جرّبها مرة على مشروع فارغ قبل أن تحتاجها)

```bash
# 1. نزّل المرفق وتحقق منه
gh run download <run-id> -n zen-db-<stamp> -D restore && cd restore
sha256sum -c SHA256SUMS

# 2. فكّ التشفير
age -d -i ~/zen-backup.key zen-db-<stamp>.dump.age > zen.dump
pg_restore --list zen.dump | head          # يجب أن تظهر جداول public وauth

# 3. استعد إلى مشروع Supabase فارغ (Staging، docs/STAGING.md) — لا إلى الإنتاج مباشرة
psql "$STAGING_DB_URL" -c "create schema if not exists private"
pg_restore --dbname "$STAGING_DB_URL" --no-owner --no-privileges \
  --schema=private --schema=public --clean --if-exists zen.dump
pg_restore --dbname "$STAGING_DB_URL" --no-owner --no-privileges \
  --schema=auth --data-only --disable-triggers zen.dump
```

- **private ثم public:** كاملان (المخطط والبيانات والدوال والسياسات). سياسات public تستدعي دوال private،
  فاستعادة public وحده تُسقطها.
- **auth:** البيانات فقط، لأن Supabase يملك مخطط `auth` في المشروع الجديد. بعدها يدخل المستخدمون بكلمات
  مرورهم نفسها.
- **storage:** اختياري. الصفوف وحدها بلا الملفات لا تفيد، فانسخ حاوية `recitations` بأداة التخزين إن
  لزم.

بعد الاستعادة: `npm run test:db` محلياً للتأكد من تطابق الترحيلات، ثم افتح التطبيق على مشروع Staging
وتحقق من الدخول وقائمة الحلقات.

## تجربة الاستعادة الشهرية (إلزامية)

نسخة لم تُجرَّب استعادتها ليست نسخة. مرة كل شهر، على جهازك:

```bash
ZEN_BACKUP_KEY=~/zen-backup.key TARGET_DB_URL="$STAGING_DB_URL" scripts/restore-drill.sh
```

يرفض السكربت رابط الإنتاج، ويتحقق من البصمة، ويستعيد `private` و`public`، ويكتب محضراً
`zen-ops/restore-drills/restore-drill-<stamp>.md` بعدد الجداول والسياسات وأخطاء `pg_restore` وأعداد الجداول الأساسية. أضف سطراً
إلى السجل أدناه.

- **الهدف Postgres 17 محلي فارغ** (بلا Staging): يكتشف السكربت غياب `auth`، فيُنشئ أدوار Supabase
  (`anon` و`authenticated` و`service_role`) ويستعيد `auth` من النسخة أيضاً.
- إن فشل `gh run download` (وكيل لا يتبع تحويل رابط التخزين) ينزّل السكربت zip المرفق عبر API، ويلزمه `unzip`.
- التشغيل بلا رقم يأخذ آخر تشغيل **ناجح**؛ مرّر رقم التشغيل صراحة لتجربة نسخة بعينها.

### سجل التجارب

| التاريخ    | التشغيل                                          | النتيجة | ملاحظات                                                                                                                                                                                          |
| ---------- | ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-03 | [37150813830](../../../actions/runs/37150813830) | جزئية   | النسخة دون `private`: 204 أخطاء استعادة، سقطت ~70 سياسة وجدول `certificates` ← أُضيف `private` للنسخة                                                                                            |
| 2026-10-03 | [37151201078](../../../actions/runs/37151201078) | ناجحة   | Postgres 17 محلي فارغ؛ auth+private+public؛ 86/86 جدولاً، 105 سياسة، 0 أخطاء؛ 30 دالة private؛ الصفوف مطابقة (profiles 1، user_roles 3، centers 1، halaqat 1، auth.users 1، common_passwords 71) |

## الاحتفاظ بالتسجيلات (تدقيق 2.2)

الملف الصوتي الخام لكل تسميع يُحذف بعد 90 يوماً (إلا ما بانتظار المعلّم)، وتبقى النتيجة. المجدول
`zen-maintenance` (يومياً 03:17 UTC) لا يتصل بالشبكة إن لم يوجد مرشّح. الإعداد مرة واحدة:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/zen-maintenance', 'zen_maintenance_url');
-- السرّ: zen_maintenance_secret (MAINTENANCE_SECRET) منذ 1.31.0، ومؤقتاً zen_push_dispatch_secret قبل ضبطه:
--   supabase secrets set MAINTENANCE_SECRET=<سلسلة عشوائية جديدة>
--   select vault.create_secret('<السلسلة نفسها>', 'zen_maintenance_secret');
-- ثم أعد نشر zen-maintenance؛ متى وُجد MAINTENANCE_SECRET رفضت الدالة سرّ الإشعارات (P1-04).
```

ثم `supabase functions deploy zen-maintenance --no-verify-jwt`. التحقق: `select public.maintenance_tick();`
تعيد `idle` أو `queued`، وبطاقة «حجم البيانات» في لوحة صاحب التطبيق تعرض «حُذف … خلال 30 يوماً».
النسخ الاحتياطية تحوي الملفات المحذوفة حتى تُستبدل (30 يوماً)، وهذا ما تعلنه صفحة «حذف الحساب».

## حدود معروفة

- التسجيلات الصوتية لا تدخل النسخة (الحجم). أهمها ما اعتمده المعلّم، ودرجاته ونصه في `public`.
- الاحتفاظ 30 يوماً. للاحتفاظ أطول نزّل نسخة أسبوعية إلى تخزين خارجي.

## سجل النشر

كل دفعة ترحيلات مطبَّقة على الإنتاج، ونسختها الاحتياطية، وتحقّقها بعد النشر: [DEPLOYMENTS.md](DEPLOYMENTS.md).
التحقق للقراءة فقط بعد النشر: سير «تحقق الإنتاج» (`db-verify.yml`) بملف من `supabase/verify`.
