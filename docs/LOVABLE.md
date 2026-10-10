# سياسة العمل مع Lovable — المرحلة 8.6

## ما حدث

دمج من محرّر Lovable (`cfc7df7`) مسح `main` فاستُعيد في PR #11. Lovable يكتب مباشرة على الفرع
المربوط، وحماية الفروع (Branch protection / Rulesets) **غير متاحة** على مستودع خاص بخطة GitHub
المجانية (رد GitHub: «Upgrade to GitHub Pro or make this repository public»).

## القاعدة المعتمدة

1. **لا تحرير من Lovable على `main`.** إن احتجت المحرّر: من إعدادات Lovable ← GitHub اختر فرعاً
   باسم `lovable` (ميزة تبديل الفروع)، ثم افتح طلب دمج من `lovable` إلى `main`.
2. كل طلب دمج — من Lovable أو غيره — يمرّ بالفحوص الستة قبل الدمج:
   `typecheck` و`lint` و`test:unit` و`build` و`test:db` و`check:types-fresh`.
3. لا إعادة كتابة للتاريخ على `main` (لا force push ولا rebase على ما دُفع).
4. تعديلات Lovable على قاعدة البيانات (ترحيلات بأسماء UUID) لا تُقبل إلا بفحص RLS في
   `supabase/tests/checks.sql` وإعادة توليد الأنواع (`npm run gen:types`).

## حين تُرقّى الخطة إلى GitHub Pro

فعّل Ruleset على `main`: منع الدفع المباشر، واشتراط طلب دمج، واشتراط نجاح فحص «فحوصات الجودة».
