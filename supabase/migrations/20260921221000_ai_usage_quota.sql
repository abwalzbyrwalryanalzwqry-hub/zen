-- ─────────── حدّ استهلاك الذكاء الاصطناعي لكل مستخدم ───────────
-- الهدف: منع استنزاف أرصدة الذكاء الاصطناعي عبر نداء دوال الخادم بشكل مفرط.
-- الجدول يُكتب ويُقرأ من دور الخدمة فقط (عبر دوال الخادم)، ولا يُكشف للعميل.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('chat', 'summarize', 'learn', 'feedback', 'transcribe', 'coach')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_time_idx
  ON public.ai_usage_events (user_id, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

-- سياسة قراءة واحدة: يرى المستخدم استهلاكه فقط (للوحة مستقبلية)، ولا يكتب شيئاً.
DROP POLICY IF EXISTS "users read own ai usage" ON public.ai_usage_events;
CREATE POLICY "users read own ai usage" ON public.ai_usage_events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.ai_usage_events TO authenticated;

-- حجز حصة بشكل ذرّي: يتحقق من الحدّ الدقيقي واليومي ثم يسجّل الحدث.
-- يعيد: { allowed, reason, used_today, daily_limit }
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  _user_id uuid,
  _feature text,
  _daily_limit integer,
  _minute_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used_day integer;
  used_minute integer;
BEGIN
  SELECT count(*) INTO used_day
  FROM public.ai_usage_events
  WHERE user_id = _user_id
    AND feature = _feature
    AND created_at >= now() - interval '1 day';

  SELECT count(*) INTO used_minute
  FROM public.ai_usage_events
  WHERE user_id = _user_id
    AND created_at >= now() - interval '1 minute';

  IF used_minute >= _minute_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'minute',
      'used_today', used_day, 'daily_limit', _daily_limit
    );
  END IF;

  IF used_day >= _daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'daily',
      'used_today', used_day, 'daily_limit', _daily_limit
    );
  END IF;

  INSERT INTO public.ai_usage_events (user_id, feature) VALUES (_user_id, _feature);

  RETURN jsonb_build_object(
    'allowed', true, 'reason', null,
    'used_today', used_day + 1, 'daily_limit', _daily_limit
  );
END;
$$;

-- دور الخدمة فقط — لا يستطيع العميل تجاوز الحدّ بنداء الدالة مباشرة.
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) TO service_role;
