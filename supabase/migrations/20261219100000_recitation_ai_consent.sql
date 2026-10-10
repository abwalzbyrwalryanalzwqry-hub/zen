-- ════════════════════════════════════════════════════════════════════════════
-- تدقيق أكتوبر 2026 (P0-05) — موافقة صريحة على التحليل الآلي لصوت التسميع
-- ════════════════════════════════════════════════════════════════════════════
-- كان «zen-recitation» يرسل تسجيل الطالب (أو مقاطع التسميع المباشر) إلى مزوّد الذكاء الاصطناعي دون موافقة
-- تخصّ الصوت؛ الموافقة الوحيدة كانت «سياق الحفظ للمساعد» (12.2). هنا موافقة مستقلة، مطفأة افتراضياً،
-- يمنحها صاحب الصوت نفسه ويسحبها متى شاء، وتتحقق منها دالة Edge قبل أي إرسال (ولو طلبه المعلّم).
-- التسجيل وإرساله للمعلّم يبقيان دون موافقة: لا يغادران Supabase.

ALTER TABLE public.ai_consents
  ADD COLUMN IF NOT EXISTS recitation_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recitation_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS recitation_revoked_at timestamptz;

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
    'recitation_revoked_at', c.recitation_revoked_at)
    FROM (SELECT (SELECT auth.uid()) AS uid) me
    LEFT JOIN public.ai_consents c ON c.user_id = me.uid
   WHERE me.uid IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_ai_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_consent() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_recitation_ai_consent(_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  v boolean := COALESCE(_on, false);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  INSERT INTO public.ai_consents AS c (user_id, recitation_audio, recitation_granted_at, recitation_revoked_at, updated_at)
  VALUES (caller, v, CASE WHEN v THEN now() END, CASE WHEN NOT v THEN now() END, now())
  ON CONFLICT (user_id) DO UPDATE
     SET recitation_audio = v,
         recitation_granted_at = CASE WHEN v THEN now() ELSE c.recitation_granted_at END,
         recitation_revoked_at = CASE WHEN v THEN c.recitation_revoked_at ELSE now() END,
         updated_at = now();
  RETURN public.my_ai_consent();
END;
$$;
REVOKE ALL ON FUNCTION public.set_recitation_ai_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recitation_ai_consent(boolean) TO authenticated;

-- لدالة Edge فقط: هل وافق صاحب الصوت؟ لا موافقة = false (يُغلق الباب افتراضياً).
CREATE OR REPLACE FUNCTION public.has_recitation_ai_consent(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ai_consents c WHERE c.user_id = _user AND c.recitation_audio)
$$;
REVOKE ALL ON FUNCTION public.has_recitation_ai_consent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_recitation_ai_consent(uuid) TO service_role;
