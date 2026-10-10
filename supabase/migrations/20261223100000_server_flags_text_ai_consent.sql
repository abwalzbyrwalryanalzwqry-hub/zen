-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- جاهزية المستودع العام (تحليل 10 أكتوبر 2026، N-02 وN-03 وN-05) — الخادم هو الحَكَم في الذكاء الاصطناعي
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) مفاتيح الميزات على الخادم: `private.feature_on` تطابق `isFeatureOn` في src/lib/feature-flags.ts حرفياً
--    (FNV-1a على «المفتاح:الحساب»). المفتاح غير الموجود في الجدول: مطفأ لـ assistant وfees وremote وrecite_ai،
--    ومفعّل لغيرها (مطابق لـ FEATURE_DEFAULTS).
-- 2) موافقة الذكاء الاصطناعي النصّي (`text_ai`): المساعد، ومدرّب «محاسبتي»، وميزات القرآن، وتلخيص المحادثات،
--    وتعليل خطة الحفظ. يُرسل فيها نص المستخدم إلى مزوّد خارجي، فلا تعمل إلا بموافقته، ولا تعمل للقاصر مطلقاً
--    (القرار 0011: الأبسط والأسلم تحت سياسة العائلات؛ القاصر = مرتبط بوليّ أمر أو لم يُقرّ بـ 13+).
-- 3) `public.ai_access_denial(user, feature)` لدوال Edge: NULL = مسموح، وإلا رمز الرفض.
--    'assistant' (محادثة المساعد): المفتاح + الموافقة + ليس قاصراً.
--    'text' (بقية الميزات النصية للطالب): الموافقة + ليس قاصراً.
--    'recite_ai' (تفريغ التلاوة وملاحظاتها): المفتاح وحده؛ موافقة الصوت في has_recitation_ai_consent كما هي.
--    'teacher' (أدوات المعلّم بحقائق مجهّلة): ليس حساباً مرتبطاً بوليّ أمر.

ALTER TABLE public.ai_consents
  ADD COLUMN IF NOT EXISTS text_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS text_ai_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS text_ai_revoked_at timestamptz;

-- FNV-1a 32-bit مطابق لـ bucketOf (المفتاح ومعرّف الحساب ASCII فقط).
CREATE OR REPLACE FUNCTION private.flag_bucket(_key text, _user uuid)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  h bigint := 2166136261;
  s text := _key || ':' || _user::text;
  i integer;
BEGIN
  FOR i IN 1..length(s) LOOP
    h := h # ascii(substr(s, i, 1));
    h := (h * 16777619) & 4294967295;
  END LOOP;
  RETURN (h % 100)::integer;
END;
$$;
REVOKE ALL ON FUNCTION private.flag_bucket(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.feature_on(_key text, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN f.key IS NULL THEN x.k NOT IN ('assistant', 'fees', 'remote', 'recite_ai')
           WHEN NOT f.enabled THEN false
           WHEN f.rollout >= 100 THEN true
           WHEN f.rollout <= 0 OR _user IS NULL THEN false
           ELSE private.flag_bucket(x.k, _user) < f.rollout
         END
    FROM (SELECT _key AS k) x
    LEFT JOIN public.feature_flags f ON f.key = x.k
$$;
REVOKE ALL ON FUNCTION private.feature_on(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_access_denial(_user uuid, _feature text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN _user IS NULL THEN 'AUTH_REQUIRED'
           WHEN _feature NOT IN ('assistant', 'text', 'recite_ai', 'teacher') THEN 'UNKNOWN_FEATURE'
           WHEN _feature IN ('assistant', 'recite_ai') AND NOT private.feature_on(_feature, _user)
             THEN 'FEATURE_OFF'
           WHEN _feature IN ('assistant', 'text')
                AND NOT COALESCE((SELECT c.text_ai FROM public.ai_consents c WHERE c.user_id = _user), false)
             THEN 'CONSENT_REQUIRED'
           WHEN _feature IN ('assistant', 'text') AND private.is_minor_account(_user)
             THEN 'MINOR_BLOCKED'
           -- أدوات المعلّم لا تحتاج إقرار عمر (المعلّم لا يُسأل عنه)، لكن الحساب المرتبط بوليّ أمر لا يستعملها.
           WHEN _feature = 'teacher'
                AND EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.student_id = _user)
             THEN 'MINOR_BLOCKED'
           ELSE NULL
         END
$$;
REVOKE ALL ON FUNCTION public.ai_access_denial(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_access_denial(uuid, text) TO service_role;

-- my_ai_consent: الحقول السابقة كما هي، ومعها text_ai وtext_ai_effective.
CREATE OR REPLACE FUNCTION public.my_ai_consent()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'memo_context', COALESCE(c.memo_context, false),
    'granted_at', c.granted_at,
    'revoked_at', c.revoked_at,
    'recitation_audio', COALESCE(c.recitation_audio, false),
    'recitation_granted_at', c.recitation_granted_at,
    'recitation_revoked_at', c.recitation_revoked_at,
    'age_13_plus', COALESCE(c.age_13_plus, false),
    'has_guardian', EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.student_id = me.uid),
    'minor', private.is_minor_account(me.uid),
    'guardian_recitation', private.guardian_recitation_ok(me.uid),
    'recitation_effective', COALESCE(c.recitation_audio, false)
        AND (NOT private.is_minor_account(me.uid) OR private.guardian_recitation_ok(me.uid)),
    'text_ai', COALESCE(c.text_ai, false),
    'text_ai_effective', COALESCE(c.text_ai, false) AND NOT private.is_minor_account(me.uid))
    FROM (SELECT (SELECT auth.uid()) AS uid) me
    LEFT JOIN public.ai_consents c ON c.user_id = me.uid
   WHERE me.uid IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_ai_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_consent() TO authenticated;

-- الموافقة مع إقرار العمر (كموافقة الصوت). السحب لا يغيّر الإقرار.
CREATE OR REPLACE FUNCTION public.set_text_ai_consent(_on boolean, _age_13_plus boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  v boolean := COALESCE(_on, false);
  adult boolean := COALESCE(_age_13_plus, false);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  INSERT INTO public.ai_consents AS c (user_id, text_ai, text_ai_granted_at, text_ai_revoked_at, age_13_plus, updated_at)
  VALUES (caller, v, CASE WHEN v THEN now() END, CASE WHEN NOT v THEN now() END, adult, now())
  ON CONFLICT (user_id) DO UPDATE
     SET text_ai = v,
         text_ai_granted_at = CASE WHEN v THEN now() ELSE c.text_ai_granted_at END,
         text_ai_revoked_at = CASE WHEN v THEN c.text_ai_revoked_at ELSE now() END,
         age_13_plus = CASE WHEN v THEN adult ELSE c.age_13_plus END,
         updated_at = now();
  RETURN public.my_ai_consent();
END;
$$;
REVOKE ALL ON FUNCTION public.set_text_ai_consent(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_text_ai_consent(boolean, boolean) TO authenticated;

-- تحليل التلاوة الآلي مطفأ حتى تجتاز مجموعة التقييم بوابة القبول (ai-eval/recitation/README.md).
-- التسجيل والإرسال للمعلّم يبقيان تحت مفتاح `recite`. يفعّله صاحب التطبيق من «مفاتيح الميزات».
INSERT INTO public.feature_flags (key, enabled, rollout, note)
VALUES ('recite_ai', false, 0, 'مطفأ حتى اجتياز بوابة تقييم التسميع')
ON CONFLICT (key) DO NOTHING;
