-- تدقيق أكتوبر 2026 — المرحلة 2 (الجاهزية للإطلاق): الاحتفاظ بالتسجيلات ومراقبة الحجم.
--
-- 2.2  التسجيلات الصوتية الخام تُحذف بعد 90 يوماً من إنشائها، وتبقى نتيجتها (الحالة، التقييم، النص، التحليل).
--      الحذف من التخزين عبر واجهة Storage في دالة Edge «zen-maintenance» (Supabase يمنع الحذف المباشر من
--      storage.objects)؛ هنا: اختيار المرشّحين، وتعليم المحذوف، والمجدول اليومي.
-- 2.3  storage_usage(): حجم قاعدة البيانات وكل حاوية لصاحب التطبيق (لوحة «الاستخدام»)، لرصد حدود الخطة.

ALTER TABLE public.recitation_sessions ADD COLUMN IF NOT EXISTS audio_purged_at timestamptz;
COMMENT ON COLUMN public.recitation_sessions.audio_purged_at IS
  'وقت حذف الملف الصوتي الخام بسياسة الاحتفاظ (90 يوماً)؛ النتيجة تبقى.';

-- فهرس جزئي لما يملك ملفاً فقط: يبقى صغيراً لأن المحذوف يخرج منه.
CREATE INDEX IF NOT EXISTS recitation_sessions_audio_created_idx
  ON public.recitation_sessions (created_at) WHERE audio_path IS NOT NULL;

-- ─── المرشّحون: أقدم من _days (30 على الأقل)، وليست بانتظار المعلّم أو قيد الرفع ───
CREATE OR REPLACE FUNCTION public.retention_audio_candidates(_days integer DEFAULT 90, _limit integer DEFAULT 200)
RETURNS TABLE (id uuid, audio_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.audio_path
    FROM public.recitation_sessions s
   WHERE s.audio_path IS NOT NULL
     AND s.status NOT IN ('awaiting_teacher', 'recording', 'uploading')
     AND s.created_at < now() - make_interval(days => GREATEST(30, COALESCE(_days, 90)))
   ORDER BY s.created_at
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 200), 1000));
$$;

-- ─── ما زال موجوداً في الحاوية من هذه المسارات (لتمييز «غير موجود أصلاً» عن «فشل الحذف») ───
CREATE OR REPLACE FUNCTION public.retention_paths_present(_paths text[])
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name FROM storage.objects o
   WHERE o.bucket_id = 'recitations' AND o.name = ANY (COALESCE(_paths, '{}'::text[]));
$$;

CREATE OR REPLACE FUNCTION public.retention_mark_purged(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.recitation_sessions
     SET audio_path = NULL, audio_purged_at = now()
   WHERE id = ANY (COALESCE(_ids, '{}'::uuid[])) AND audio_path IS NOT NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.retention_audio_candidates(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_paths_present(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_mark_purged(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retention_audio_candidates(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.retention_paths_present(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.retention_mark_purged(uuid[]) TO service_role;

-- ─── المجدول: يومياً 03:17 UTC، بلا نداء شبكة إن لم يوجد مرشّح ───
-- الرابط في Vault (مرة واحدة، docs/BACKUP.md):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/zen-maintenance', 'zen_maintenance_url');
-- والسرّ هو نفسه zen_push_dispatch_secret (PUSH_DISPATCH_SECRET).
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
             (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_push_dispatch_secret')
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-maintenance';
    PERFORM cron.schedule('zen-maintenance', '17 3 * * *', 'SELECT public.maintenance_tick()');
  END IF;
END $$;

-- ─── 2.3) مراقبة الحجم لصاحب التطبيق ───
-- الخطة المجانية: 500MB قاعدة بيانات و1GB تخزين. النسبة تُحسب في الواجهة من هذه الأرقام.
CREATE OR REPLACE FUNCTION public.storage_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_owner() THEN
    RETURN jsonb_build_object('status', 'not_owner');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'db_bytes', pg_database_size(current_database()),
    'buckets', (SELECT COALESCE(jsonb_object_agg(b.id, jsonb_build_object(
                   'objects', COALESCE(x.n, 0), 'bytes', COALESCE(x.bytes, 0))), '{}'::jsonb)
                  FROM storage.buckets b
                  LEFT JOIN (SELECT bucket_id, count(*) AS n,
                                    sum(COALESCE((metadata->>'size')::bigint, 0)) AS bytes
                               FROM storage.objects GROUP BY bucket_id) x ON x.bucket_id = b.id),
    'audio_purged_30d', (SELECT count(*) FROM public.recitation_sessions
                          WHERE audio_purged_at > now() - interval '30 days'),
    'audio_pending_purge', (SELECT count(*) FROM public.recitation_sessions s
                             WHERE s.audio_path IS NOT NULL
                               AND s.status NOT IN ('awaiting_teacher', 'recording', 'uploading')
                               AND s.created_at < now() - interval '90 days')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.storage_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_usage() TO authenticated, service_role;
