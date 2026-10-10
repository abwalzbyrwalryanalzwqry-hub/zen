-- ════════════════════════════════════════════════════════════════════════════
-- تدقيق أكتوبر 2026 (P2-04) — حدّ الدقيقة لكل ميزة
-- ════════════════════════════════════════════════════════════════════════════
-- كان حدّ الدقيقة يعدّ كل ميزات المستخدم معاً، فجلسة تسميع مباشر (مقطع كل بضع ثوانٍ) تحجب المحادثة والمساعد
-- لدقيقة كاملة. الآن يُعدّ لكل ميزة على حدة كالحدّ اليومي. الكلفة الكلية تبقى محدودة بالحدود اليومية لكل ميزة.
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
  -- الطلبات المتوازية للمستخدم نفسه تُنفَّذ واحداً تلو الآخر حتى نهاية المعاملة.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_quota:' || _user_id::text, 0));

  SELECT count(*) INTO used_day
    FROM public.ai_usage_events
   WHERE user_id = _user_id AND feature = _feature
     AND created_at >= now() - interval '1 day';

  SELECT count(*) INTO used_minute
    FROM public.ai_usage_events
   WHERE user_id = _user_id AND feature = _feature
     AND created_at >= now() - interval '1 minute';

  IF used_minute >= _minute_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'minute',
                              'used_today', used_day, 'daily_limit', _daily_limit);
  END IF;
  IF used_day >= _daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily',
                              'used_today', used_day, 'daily_limit', _daily_limit);
  END IF;

  INSERT INTO public.ai_usage_events (user_id, feature) VALUES (_user_id, _feature);
  RETURN jsonb_build_object('allowed', true, 'reason', null,
                            'used_today', used_day + 1, 'daily_limit', _daily_limit);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) TO service_role;
