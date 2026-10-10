-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 7.7 — تنبيه الأخطاء وشاشة «صحة التطبيق»
-- ════════════════════════════════════════════════════════════════════════════
-- 1) error_alert_runs: سجل تشغيل لكل ساعة (القاعدة 13: مهمة متكرّرة بأمان بجدول تتّبع).
-- 2) app_error_alert_tick(): كل ساعة يعدّ الأخطاء الجديدة في الساعة الماضية، ويُشعر صاحب التطبيق
--    إن تجاوزت الحد، مرة واحدة على الأكثر كل 6 ساعات. للخادم وحده.
-- 3) is_app_owner() وapp_health(): لصاحب التطبيق وحده، ولا أعمدة حسّاسة (لا stack ولا user_id).

CREATE TABLE IF NOT EXISTS public.error_alert_runs (
  hour timestamptz PRIMARY KEY,
  errors integer NOT NULL,
  threshold integer NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.error_alert_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.error_alert_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.error_alert_runs TO service_role;
COMMENT ON TABLE public.error_alert_runs IS
  'تشغيل تنبيه الأخطاء لكل ساعة (7.7). لا سياسات: الخادم وحده، وتقرؤه app_health لصاحب التطبيق.';

CREATE OR REPLACE FUNCTION public.app_error_alert_tick(_threshold integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hour timestamptz := date_trunc('hour', now());
  _errors integer;
  _owner uuid := public.app_owner_id();
  _recent boolean;
  _inserted boolean;
  _notify boolean := false;
BEGIN
  SELECT coalesce(sum(occurrences), 0)::integer INTO _errors
    FROM public.client_errors
   WHERE last_seen_at >= _hour - interval '1 hour' AND last_seen_at < _hour;

  SELECT EXISTS (SELECT 1 FROM public.error_alert_runs
                  WHERE notified AND hour > _hour - interval '6 hours') INTO _recent;

  _notify := _errors >= greatest(_threshold, 1) AND NOT _recent AND _owner IS NOT NULL;

  INSERT INTO public.error_alert_runs (hour, errors, threshold, notified)
  VALUES (_hour, _errors, _threshold, _notify)
  ON CONFLICT (hour) DO NOTHING
  RETURNING true INTO _inserted;

  -- تشغيل ثانٍ في الساعة نفسها لا يكرّر شيئاً.
  IF _inserted IS NULL THEN
    RETURN jsonb_build_object('status', 'already', 'hour', _hour);
  END IF;

  IF _notify THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (_owner, 'app_health', 'ارتفاع في أخطاء التطبيق',
            _errors || ' خطأً في الساعة الماضية (الحد ' || _threshold || '). افتح «صحة التطبيق».',
            '/app-health');
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'hour', _hour, 'errors', _errors, 'notified', _notify);
END;
$$;
REVOKE ALL ON FUNCTION public.app_error_alert_tick(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_error_alert_tick(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = public.app_owner_id();
$$;
REVOKE ALL ON FUNCTION public.is_app_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_health(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d integer := greatest(1, least(coalesce(_days, 7), 90));
BEGIN
  IF NOT public.is_app_owner() THEN
    RETURN jsonb_build_object('status', 'not_owner');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'days', _d,
    'errors_24h', (SELECT coalesce(sum(occurrences), 0) FROM public.client_errors
                    WHERE last_seen_at > now() - interval '24 hours'),
    'errors_period', (SELECT coalesce(sum(occurrences), 0) FROM public.client_errors
                       WHERE last_seen_at > now() - make_interval(days => _d)),
    'users_period', (SELECT count(DISTINCT user_id) FROM public.client_errors
                      WHERE last_seen_at > now() - make_interval(days => _d)),
    'hourly', (SELECT coalesce(jsonb_agg(jsonb_build_object('hour', h, 'errors', n) ORDER BY h), '[]')
                 FROM (SELECT date_trunc('hour', last_seen_at) AS h, sum(occurrences)::integer AS n
                         FROM public.client_errors
                        WHERE last_seen_at > now() - interval '24 hours'
                        GROUP BY 1) x),
    'top', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]')
              FROM (SELECT message, url, source, occurrences, users, last_seen
                      FROM public.error_summary(_d) LIMIT 20) t),
    'alerts', (SELECT coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'errors', errors,
                                                            'threshold', threshold) ORDER BY hour DESC), '[]')
                 FROM (SELECT * FROM public.error_alert_runs WHERE notified
                        ORDER BY hour DESC LIMIT 10) a)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.app_health(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_health(integer) TO authenticated, service_role;

-- الجدولة: الدقيقة 7 من كل ساعة، إن كان pg_cron مفعّلاً.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-error-alerts';
    PERFORM cron.schedule('zen-error-alerts', '7 * * * *', 'SELECT public.app_error_alert_tick(50)');
  END IF;
END $$;
