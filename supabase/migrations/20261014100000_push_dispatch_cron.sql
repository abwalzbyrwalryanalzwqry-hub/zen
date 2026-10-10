-- المرحلة 6.4: مجدول الإشعارات الفورية يستدعي دالة Edge «zen-push-dispatch» بدل نقطة الخادم.
--
-- push_dispatch_tick() تعمل كل دقيقة من pg_cron:
--   1. تضيف تذكيرات اليوم (enqueue_daily_reminders) داخل قاعدة البيانات مباشرة.
--   2. إن لم يكن في push_outbox شيء مستحق تعود 'idle' دون أي نداء شبكة (أغلب الدقائق).
--   3. وإلا ترسل طلباً واحداً عبر pg_net إلى رابط الدالة، بسرّ المجدول من Supabase Vault.
-- الرابط والسرّ لا يظهران في نص المهمة (cron.job)، ويُضبطان مرة واحدة (docs/PUSH.md):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/zen-push-dispatch', 'zen_push_dispatch_url');
--   select vault.create_secret('<PUSH_DISPATCH_SECRET>', 'zen_push_dispatch_secret');
-- بلا pg_net أو بلا الأسرار تعود 'no_pg_net' أو 'not_configured' بهدوء، ولا تُفشل المهمة.

CREATE OR REPLACE FUNCTION public.push_dispatch_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  PERFORM public.enqueue_daily_reminders(now());

  IF NOT EXISTS (
    SELECT 1 FROM public.push_outbox o
     WHERE o.sent_at IS NULL AND o.failed_at IS NULL AND o.attempts < 5 AND o.send_after <= now()
  ) THEN
    RETURN 'idle';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN 'no_pg_net';
  END IF;

  BEGIN
    EXECUTE $q$
      SELECT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_push_dispatch_url'),
             (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_push_dispatch_secret')
    $q$ INTO _url, _secret;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RETURN 'not_configured';
  END;
  IF _url IS NULL OR _secret IS NULL THEN
    RETURN 'not_configured';
  END IF;

  -- التذكيرات أُضيفت أعلاه، فلا تكرّرها الدالة.
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 20000)'
    USING _url,
          jsonb_build_object('Authorization', 'Bearer ' || _secret, 'Content-Type', 'application/json'),
          jsonb_build_object('reminders', false);
  RETURN 'queued';
END;
$$;
REVOKE ALL ON FUNCTION public.push_dispatch_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_dispatch_tick() TO service_role;

-- الجدولة كل دقيقة إن كان pg_cron مفعّلاً (الاسم نفسه يحدّث المهمة القائمة، فالترحيل آمن للتكرار).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('zen-push-dispatch', '* * * * *', 'SELECT public.push_dispatch_tick()');
  END IF;
END
$$;
