-- ════════════════════════════════════════════════════════════════════════════
-- القاصرون وسياسة العائلات (القرار 0011، الخيار أ) — موافقة وليّ الأمر على التحليل الآلي للصوت
-- ════════════════════════════════════════════════════════════════════════════
-- القاصر هنا:
--   (1) حساب مرتبط بوليّ أمر (guardian_links)، كقاعدة الإحصاءات نفسها، أو
--   (2) من لم يُقرّ بأن عمره 13 سنة فأكثر عند موافقته.
-- القاصر لا يُحلَّل صوته آلياً إلا بموافقتين: موافقته هو، وموافقة وليّ أمر مرتبط به من بوابة وليّ الأمر.
-- والقاصر بلا وليّ أمر مرتبط لا تكفيه موافقته، فيُطلب منه ربط وليّ أمره أولاً.
-- الدالة `has_recitation_ai_consent` (لدالة Edge) لم تتغيّر صيغتها، فلا تحتاج zen-recitation إلى تعديل.

ALTER TABLE public.ai_consents
  ADD COLUMN IF NOT EXISTS age_13_plus boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.guardian_ai_consents (
  guardian_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recitation_audio boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, student_id)
);
CREATE INDEX IF NOT EXISTS guardian_ai_consents_student_idx ON public.guardian_ai_consents (student_id);
ALTER TABLE public.guardian_ai_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_ai_consents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.guardian_ai_consents TO service_role;

-- هل الحساب قاصر في نظر الموافقات؟
CREATE OR REPLACE FUNCTION private.is_minor_account(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.student_id = _user)
      OR NOT COALESCE((SELECT c.age_13_plus FROM public.ai_consents c WHERE c.user_id = _user), false)
$$;
REVOKE ALL ON FUNCTION private.is_minor_account(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guardian_recitation_ok(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guardian_ai_consents a
      JOIN public.guardian_links g ON g.guardian_id = a.guardian_id AND g.student_id = a.student_id
     WHERE a.student_id = _user AND a.recitation_audio)
$$;
REVOKE ALL ON FUNCTION private.guardian_recitation_ok(uuid) FROM PUBLIC, anon, authenticated;

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
        AND (NOT private.is_minor_account(me.uid) OR private.guardian_recitation_ok(me.uid)))
    FROM (SELECT (SELECT auth.uid()) AS uid) me
    LEFT JOIN public.ai_consents c ON c.user_id = me.uid
   WHERE me.uid IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_ai_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_consent() TO authenticated;

-- الموافقة مع إقرار العمر. الصيغة القديمة (boolean) تبقى وتعني «لم يُقرّ بالعمر» فلا تكسر النسخ المثبَّتة.
CREATE OR REPLACE FUNCTION public.set_recitation_ai_consent(_on boolean, _age_13_plus boolean)
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
  INSERT INTO public.ai_consents AS c (user_id, recitation_audio, recitation_granted_at, recitation_revoked_at, age_13_plus, updated_at)
  VALUES (caller, v, CASE WHEN v THEN now() END, CASE WHEN NOT v THEN now() END, adult, now())
  ON CONFLICT (user_id) DO UPDATE
     SET recitation_audio = v,
         recitation_granted_at = CASE WHEN v THEN now() ELSE c.recitation_granted_at END,
         recitation_revoked_at = CASE WHEN v THEN c.recitation_revoked_at ELSE now() END,
         -- السحب لا يغيّر الإقرار؛ الموافقة تسجّل الإقرار الحالي.
         age_13_plus = CASE WHEN v THEN adult ELSE c.age_13_plus END,
         updated_at = now();
  RETURN public.my_ai_consent();
END;
$$;
REVOKE ALL ON FUNCTION public.set_recitation_ai_consent(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recitation_ai_consent(boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_recitation_ai_consent(_on boolean)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.set_recitation_ai_consent(_on, COALESCE(
    (SELECT c.age_13_plus FROM public.ai_consents c WHERE c.user_id = (SELECT auth.uid())), false))
$$;
REVOKE ALL ON FUNCTION public.set_recitation_ai_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recitation_ai_consent(boolean) TO authenticated;

-- لدالة Edge فقط. الصيغة نفسها، والقاعدة الجديدة: القاصر يحتاج موافقة وليّ أمر مرتبط.
CREATE OR REPLACE FUNCTION public.has_recitation_ai_consent(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ai_consents c WHERE c.user_id = _user AND c.recitation_audio)
     AND (NOT private.is_minor_account(_user) OR private.guardian_recitation_ok(_user))
$$;
REVOKE ALL ON FUNCTION public.has_recitation_ai_consent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_recitation_ai_consent(uuid) TO service_role;

-- بوابة وليّ الأمر: حالة كل ابن مرتبط، والتفعيل أو السحب.
CREATE OR REPLACE FUNCTION public.guardian_ai_consents_list()
RETURNS TABLE (student_id uuid, recitation_audio boolean, student_consent boolean, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.student_id,
         COALESCE(a.recitation_audio, false),
         COALESCE(c.recitation_audio, false),
         a.updated_at
    FROM public.guardian_links g
    LEFT JOIN public.guardian_ai_consents a ON a.guardian_id = g.guardian_id AND a.student_id = g.student_id
    LEFT JOIN public.ai_consents c ON c.user_id = g.student_id
   WHERE g.guardian_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION public.guardian_ai_consents_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_ai_consents_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_guardian_recitation_consent(_student uuid, _on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  v boolean := COALESCE(_on, false);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.guardian_id = caller AND g.student_id = _student) THEN
    RAISE EXCEPTION 'NOT_GUARDIAN' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.guardian_ai_consents AS a (guardian_id, student_id, recitation_audio, granted_at, revoked_at, updated_at)
  VALUES (caller, _student, v, CASE WHEN v THEN now() END, CASE WHEN NOT v THEN now() END, now())
  ON CONFLICT (guardian_id, student_id) DO UPDATE
     SET recitation_audio = v,
         granted_at = CASE WHEN v THEN now() ELSE a.granted_at END,
         revoked_at = CASE WHEN v THEN a.revoked_at ELSE now() END,
         updated_at = now();
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.set_guardian_recitation_consent(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guardian_recitation_consent(uuid, boolean) TO authenticated;
