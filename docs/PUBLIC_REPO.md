# المستودع العام — الإعداد والتشغيل

**القرار:** الكود في مستودع عام جديد `abwalzbyrwalryanalzwqry-hub/zen` بإيداع أول نظيف (بلا تاريخ المستودع الخاص)،
وتشغيل الإنتاج في مستودع خاص `abwalzbyrwalryanalzwqry-hub/zen-ops`. المستودع الخاص القديم
`zen-your-islamic-learning-companion` يُؤرشف للقراءة فقط.

## لماذا مستودع جديد لا تحويل القديم؟

سجل المستودع القديم فيه ما لا يجوز نشره: ملفات خط «ثمانية» التجاري (أُزيلت في 1.31.0 وبقيت في التاريخ)،
و`google-services.json` (الإيداع `ec0b2bb`)، وبريد المالك الشخصي في 214 إيداعاً. إعادة كتابة التاريخ لا تكفي: صفحات
طلبات الدمج القديمة (220 طلباً) تُبقي الإيداعات القديمة متاحة بمعرّفها، ولا يحذفها إلا دعم GitHub.

**أثره على Lovable:** Lovable لا يرتبط بمستودع موجود، فالمزامنة تبقى على المستودع القديم وحده. آخر إيداع من Lovable كان
في 2026-09-22، والتطوير منذ ذلك مباشر على GitHub؛ والقرار E.5 في خطة التحليل يتّجه إلى التحرّر من إعداد Lovable أصلاً.

## ما في المستودع العام وما ليس فيه

| في العام                                   | في zen-ops الخاص فقط                              | لا في أيّهما (أسرار)                             |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| كل الكود والترحيلات والاختبارات والتوثيق   | `db-backup` و`db-migrate` و`db-verify` و`staging` | `SUPABASE_DB_URL` ومفاتيح التوقيع وحسابات الخدمة |
| CI وE2E وAndroid وفحص الأسرار (gitleaks)   | محاضر تجارب الاستعادة                             | مفتاح age الخاص (خارج GitHub تماماً)             |
| `android-release.yml` بالبيئة `production` |                                                   |                                                  |
| `.env` بمفتاح Supabase العام (anon)        |                                                   |                                                  |

## خطوات المالك

### أولاً: قبل جعل المستودع عاماً

1. **راجع المستودع الجديد وهو خاص** (أُنشئ خاصاً عمداً). ابحث عمّا لا تريد نشره، ومنه رقمك وبريدك في
   `src/lib/developer.ts` (يظهران في التطبيق للتواصل، فهما عامّان أصلاً في APK).
2. **الترخيص:** أضف `LICENSE` إن أردت كوداً مفتوح المصدر (MIT أو Apache-2.0 أو AGPL-3.0)، أو اتركه بلا ترخيص فيبقى
   «كل الحقوق محفوظة» والكود للقراءة فقط.
3. **بيانات التفسير:** راجع شروط إعادة التوزيع لمصادر `public/data` في `docs/DATA_SOURCES.md` (التفسير الميسّر
   والمختصر من QUL). إن منعت الشروط النشر العام فاحذف الملفات من العام وحمّلها وقت البناء من مصدرها.
4. **انشر الترحيل `20261223100000_server_flags_text_ai_consent.sql` قبل دوال Edge** (عبر `db-migrate` في zen-ops
   أو SQL Editor)، ثم أعد نشر `zen-ai` و`zen-tools` و`zen-recitation`. الترتيب العكسي يُرجع 503 لكل طلبات الذكاء
   الاصطناعي لأن الدوال تسأل `ai_access_denial` والفشل مغلق.
5. **`MAINTENANCE_SECRET`:** اضبطه في Supabase ← Edge Functions ← Secrets، وفي Vault باسم `maintenance_secret`.
   الكود العام يكشف أن `zen-maintenance` تقبل السرّ المشترك مؤقتاً؛ بعد ضبطه أزل القبول المؤقت.

### ثانياً: تحويله إلى عام

```sh
gh repo edit abwalzbyrwalryanalzwqry-hub/zen --visibility public --accept-visibility-change-consequences
```

### ثالثاً: فوراً بعد التحويل (كلها مجانية في المستودع العام)

1. **Settings ← Rules ← Rulesets ← New branch ruleset** على `main`: منع الحذف والدفع القسري، واشتراط طلب دمج، واشتراط نجاح
   «فحوصات الجودة» و«فحص الأسرار (gitleaks)» و«اختبارات E2E».
2. **Settings ← Code security:** فعّل Secret scanning وPush protection وPrivate vulnerability reporting وDependabot alerts.
3. **Settings ← Actions ← General:**
   - «Fork pull request workflows from outside collaborators» ← **Require approval for all external contributors**.
   - «Workflow permissions» ← **Read repository contents** (مضبوط من الآن).
4. **Settings ← Environments ← production:** «Required reviewers» = أنت، و«Deployment branches and tags» = `main` والوسوم `v*`.
   انقل إليها أسرار: `ANDROID_KEYSTORE_BASE64` و`ANDROID_KEYSTORE_PASSWORD` و`ANDROID_KEY_ALIAS` و`ANDROID_KEY_PASSWORD`
   و`PLAY_SERVICE_ACCOUNT_JSON` و`GOOGLE_SERVICES_JSON`، واحذفها من أسرار المستودع.
5. أسرار المستودع العامة المتبقية: `GEMINI_API_KEY` و`OPENAI_API_KEY` و`LOVABLE_API_KEY` (لتقييم المساعد)، و`LEGAL_SITE_TOKEN`،
   و`FIREBASE_TEST_LAB_SA`. لا تصل إلى طلبات الدمج من النسخ المتفرّعة (لا يوجد `pull_request_target`).

### رابعاً: zen-ops

1. أصلح الفوترة في GitHub (Settings ← Billing and plans): مهام المستودعات الخاصة لا تبدأ مع دفعة فاشلة. النسخ اليومي نحو
   90 دقيقة شهرياً، ضمن المجاني (2000 دقيقة).
2. في zen-ops: السرّ `SUPABASE_DB_URL`، والمتغيّر `BACKUP_AGE_RECIPIENT`، وأسرار Staging إن وُجدت.
3. شغّل «نسخة احتياطية لقاعدة البيانات» يدوياً، وتأكّد من المرفق، ثم جرّب `scripts/restore-drill.sh` مرة.

### خامساً: المستودع القديم

بعد أول نسخة احتياطية ناجحة من zen-ops وأول CI أخضر في العام: احذف منه أسرار الإنتاج، ثم أرشفه
(Settings ← Archive this repository). **لا تجعله عاماً أبداً.**

### سادساً: مفاتيح الخدمات

- **Firebase:** Google Cloud Console ← APIs & Services ← Credentials ← مفتاح Android (`AIzaSyBpG2…`): قيّده بتطبيقات
  Android (`app.zen.quran` + بصمة SHA-1 لشهادة التوقيع وشهادة Play)، وبواجهات Firebase Installations وCloud Messaging فقط.
- **Supabase:** Authentication ← Leaked password protection (يحتاج Pro)، وراجع Advisors ← Security.

## صيانة مستمرة

- `gitleaks` في CI على كل السجل؛ الاستثناءات في `.gitleaks.toml` موثَّقة ولا يُضاف إليها سرّ حقيقي أبداً.
- سرّ تسرّب؟ **دوّره أولاً** (المفتاح المكشوف مكشوف إلى الأبد)، ثم احذفه من الكود.
- الإبلاغ عن الثغرات: `SECURITY.md`.
