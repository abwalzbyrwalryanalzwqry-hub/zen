-- ════════════════════════════════════════════════════════════════════════════
-- تدقيق أكتوبر 2026 (P1-04) — سرّ مستقل لدالة الصيانة
-- ════════════════════════════════════════════════════════════════════════════
-- كان `zen-maintenance` (تحذف ملفات صوتية بصلاحية service_role) يقبل السرّ نفسه الذي يفتح
-- `zen-push-dispatch`، فتسرّب أحدهما يفتح الاثنين. الآن يقرأ المجدول سرّ Vault «zen_maintenance_secret» إن وُجد،
-- وإلا يبقى على السرّ القديم مؤقتاً كي لا تتوقف الصيانة قبل ضبط الجديد (docs/BACKUP.md):
--   1) supabase secrets set MAINTENANCE_SECRET=<سلسلة عشوائية جديدة>
--   2) select vault.create_secret('<السلسلة نفسها>', 'zen_maintenance_secret');
--   3) إعادة نشر zen-maintenance: متى وُجد MAINTENANCE_SECRET رُفض PUSH_DISPATCH_SECRET.
CREATE OR REPLACE FUNCTION public.maintenance_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.retention_audio_candidates(90, 1)) THEN
    RETURN 'idle';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN 'no_pg_net';
  END IF;
  BEGIN
    EXECUTE $q$
      SELECT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_maintenance_url'),
             COALESCE(
               (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_maintenance_secret'),
               (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_push_dispatch_secret'))
    $q$ INTO _url, _secret;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RETURN 'not_configured';
  END;
  IF _url IS NULL OR _secret IS NULL THEN
    RETURN 'not_configured';
  END IF;
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
    USING _url,
          jsonb_build_object('Authorization', 'Bearer ' || _secret, 'Content-Type', 'application/json'),
          '{}'::jsonb;
  RETURN 'queued';
END;
$$;
REVOKE ALL ON FUNCTION public.maintenance_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_tick() TO service_role;
