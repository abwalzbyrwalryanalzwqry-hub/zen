-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 13.4 — تحليلات تحترم الخصوصية
-- ════════════════════════════════════════════════════════════════════════════
-- • usage_daily: عدّادات يومية مجمّعة (اليوم، الحدث، المنصة، العدد) بلا أي معرّف مستخدم.
--   العميل يرسل كل حدث مرة واحدة في اليوم على الأكثر، فالعدد ≈ «كم مستخدماً استعمل الميزة اليوم».
-- • analytics_consents: موافقة صريحة (معطّلة افتراضياً) مع إقرار «13 سنة أو أكثر».
-- • لا تتبّع لمن دون 13: بلا الإقرار، أو إن كان الحساب طالباً مرتبطاً بوليّ أمر، يُرفض المنح
--   ويُتجاهل أي حدث بصمت.
-- • app_owners: صاحب التطبيق فقط يرى اللوحة (usage_summary). يُضاف من محرر SQL:
--     INSERT INTO public.app_owners (user_id) VALUES ('<uuid>');

CREATE TABLE IF NOT EXISTS public.usage_daily (
  day date NOT NULL,
  event text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, event, platform)
);
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.usage_daily TO service_role;

CREATE TABLE IF NOT EXISTS public.analytics_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT false,
  age_13_plus boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_consents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_consents TO service_role;

CREATE TABLE IF NOT EXISTS public.app_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_owners FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_owners TO service_role;

-- الأحداث المسموحة (أي غيرها يُتجاهل).
CREATE OR REPLACE FUNCTION public.usage_events_allowed()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['app_open', 'mushaf_open', 'assistant_ask', 'exam_done', 'recite_done',
               'room_join', 'session_recorded', 'share_card']
$$;
REVOKE ALL ON FUNCTION public.usage_events_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usage_events_allowed() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_analytics_consent()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'granted', COALESCE(c.granted, false) AND COALESCE(c.age_13_plus, false)
               AND NOT EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.student_id = me.uid),
    'age_13_plus', COALESCE(c.age_13_plus, false),
    -- طالب مرتبط بوليّ أمر: لا يُعرض عليه التتبّع أصلاً.
    'eligible', NOT EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.student_id = me.uid))
    FROM (SELECT (SELECT auth.uid()) AS uid) me
    LEFT JOIN public.analytics_consents c ON c.user_id = me.uid
   WHERE me.uid IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_analytics_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_analytics_consent() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_analytics_consent(_granted boolean, _age_13_plus boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF COALESCE(_granted, false) AND (NOT COALESCE(_age_13_plus, false)
      OR EXISTS (SELECT 1 FROM public.guardian_links g WHERE g.student_id = caller)) THEN
    RAISE EXCEPTION 'MINOR_NOT_TRACKED';
  END IF;
  INSERT INTO public.analytics_consents AS c (user_id, granted, age_13_plus, updated_at)
  VALUES (caller, COALESCE(_granted, false), COALESCE(_age_13_plus, false), now())
  ON CONFLICT (user_id) DO UPDATE
     SET granted = EXCLUDED.granted, age_13_plus = EXCLUDED.age_13_plus, updated_at = now();
  RETURN public.my_analytics_consent();
END;
$$;
REVOKE ALL ON FUNCTION public.set_analytics_consent(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_analytics_consent(boolean, boolean) TO authenticated;

-- يزيد العدّادات: كل حدث مسموح مرة واحدة في النداء، و20 حدثاً على الأكثر. بلا موافقة ⇒ 0 بصمت.
CREATE OR REPLACE FUNCTION public.track_usage(_events text[], _platform text DEFAULT 'android')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  plat text := CASE WHEN _platform IN ('android', 'ios') THEN _platform ELSE 'other' END;
  n integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT COALESCE((public.my_analytics_consent()->>'granted')::boolean, false) THEN RETURN 0; END IF;
  WITH ev AS (
    SELECT DISTINCT e FROM unnest(COALESCE(_events, '{}')) AS e
     WHERE e = ANY (public.usage_events_allowed())
     LIMIT 20
  ), up AS (
    INSERT INTO public.usage_daily AS u (day, event, platform, count)
    SELECT (now() AT TIME ZONE 'utc')::date, e, plat, 1 FROM ev
    ON CONFLICT (day, event, platform) DO UPDATE SET count = u.count + 1
    RETURNING 1
  )
  SELECT count(*) INTO n FROM up;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.track_usage(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_usage(text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.am_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_owners o WHERE o.user_id = (SELECT auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.am_app_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_app_owner() TO authenticated;

-- لوحة صاحب التطبيق: مجاميع الأيام الأخيرة (حتى 90)، ونسبة الموافقين (عددان فقط).
CREATE OR REPLACE FUNCTION public.usage_summary(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 90);
BEGIN
  IF NOT public.am_app_owner() THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  RETURN jsonb_build_object(
    'days', d,
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', u.day, 'event', u.event, 'platform', u.platform, 'count', u.count)
                       ORDER BY u.day DESC, u.event)
        FROM public.usage_daily u
       WHERE u.day > (now() AT TIME ZONE 'utc')::date - d), '[]'::jsonb),
    'consented', (SELECT count(*) FROM public.analytics_consents WHERE granted),
    'accounts', (SELECT count(*) FROM auth.users));
END;
$$;
REVOKE ALL ON FUNCTION public.usage_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usage_summary(integer) TO authenticated;
