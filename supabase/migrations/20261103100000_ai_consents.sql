-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 12.2 — سياق الحفظ للمساعد بموافقة
-- ════════════════════════════════════════════════════════════════════════════
-- بموافقة صريحة يمكن سحبها، يضيف خادم المساعد (zen-ai) إلى سياق السؤال ملخّصاً قصيراً: طابور اليوم
-- (my_today_queue) وآخر مواضع الخطأ في الاختبارات وسلسلة الالتزام. بلا موافقة لا يُقرأ شيء.
-- لا يُحفظ الملخّص؛ يُبنى عند كل سؤال ويُرسل إلى المزوّد فقط.

CREATE TABLE IF NOT EXISTS public.ai_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  memo_context boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_consents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_consents TO service_role;

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
    'revoked_at', c.revoked_at)
    FROM (SELECT (SELECT auth.uid()) AS uid) me
    LEFT JOIN public.ai_consents c ON c.user_id = me.uid
   WHERE me.uid IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_ai_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_consent() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ai_consent(_memo_context boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  INSERT INTO public.ai_consents AS c (user_id, memo_context, granted_at, revoked_at, updated_at)
  VALUES (caller, COALESCE(_memo_context, false),
          CASE WHEN _memo_context THEN now() END, CASE WHEN NOT COALESCE(_memo_context, false) THEN now() END, now())
  ON CONFLICT (user_id) DO UPDATE
     SET memo_context = EXCLUDED.memo_context,
         granted_at = CASE WHEN EXCLUDED.memo_context THEN now() ELSE c.granted_at END,
         revoked_at = CASE WHEN EXCLUDED.memo_context THEN c.revoked_at ELSE now() END,
         updated_at = now();
  RETURN public.my_ai_consent();
END;
$$;
REVOKE ALL ON FUNCTION public.set_ai_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ai_consent(boolean) TO authenticated;

-- ملخّص السياق لخادم المساعد فقط. NULL بلا موافقة.
CREATE OR REPLACE FUNCTION public.ai_memo_context(_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.ai_consents c WHERE c.user_id = _user AND c.memo_context)
    THEN jsonb_build_object(
      'queue', public.today_queue_for(_user),
      'errors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('surah_name', e.surah_name, 'from_ayah', e.from_ayah, 'to_ayah', e.to_ayah))
          FROM (SELECT surah_name, from_ayah, to_ayah FROM public.exam_errors
                 WHERE student_id = _user ORDER BY created_at DESC LIMIT 5) e), '[]'::jsonb),
      'streak', (public.streak_of(_user)->>'current')::int,
      'memorized_pages', (SELECT count(DISTINCT page) FROM public.mushaf_records
                           WHERE student_id = _user AND kind = 'memorize'))
  END
$$;
REVOKE ALL ON FUNCTION public.ai_memo_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_memo_context(uuid) TO service_role;
