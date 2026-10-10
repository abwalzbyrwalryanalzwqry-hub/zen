-- المرحلة 8.7 — مراقبة الأخطاء دون خدمة خارجية.
--
-- أخطاء المتصفح والخادم تُسجَّل في جدول لا يقرؤه إلا صاحب المشروع (لوحة Supabase أو
-- service_role). لا سياسة قراءة لأي مستخدم، والكتابة عبر دالة واحدة تُقصّ الحقول،
-- وتدمج المكرّر في صف واحد بعدّاد، وتحدّ المعدّل كي لا تصير طريقاً لإغراق القاعدة.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server')),
  fingerprint text NOT NULL,
  message text NOT NULL,
  stack text,
  url text,
  user_agent text,
  release text
);

CREATE INDEX IF NOT EXISTS client_errors_fp_idx ON public.client_errors (fingerprint, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS client_errors_user_idx ON public.client_errors (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_errors_created_idx ON public.client_errors (created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
-- لا سياسات: لا يقرأ الجدول ولا يكتب فيه مباشرة إلا service_role.
REVOKE ALL ON public.client_errors FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_client_error(
  _message text,
  _stack text DEFAULT NULL,
  _url text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _release text DEFAULT NULL,
  _source text DEFAULT 'client'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _msg text := left(btrim(coalesce(_message, '')), 1000);
  _path text := left(split_part(split_part(coalesce(_url, ''), '?', 1), '#', 1), 500);
  _fp text;
  _existing uuid;
BEGIN
  IF _msg = '' THEN
    RETURN false;
  END IF;
  IF _source IS NULL OR _source NOT IN ('client', 'server') THEN
    _source := 'client';
  END IF;

  -- البصمة: الرسالة + المسار (بلا معاملات الاستعلام التي قد تحمل رموزاً) + أول سطر في المكدّس.
  _fp := md5(_msg || '|' || _path || '|' || left(split_part(coalesce(_stack, ''), E'\n', 2), 300));

  -- الخطأ نفسه خلال ساعة ⇒ عدّاد في الصف القائم بدل صف جديد.
  SELECT id INTO _existing FROM public.client_errors
   WHERE fingerprint = _fp AND last_seen_at > now() - interval '1 hour'
     AND user_id IS NOT DISTINCT FROM _uid
   ORDER BY last_seen_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    UPDATE public.client_errors
       SET occurrences = least(occurrences + 1, 1000000), last_seen_at = now()
     WHERE id = _existing;
    RETURN true;
  END IF;

  -- حدّ المعدّل: 30 خطأً مختلفاً في الساعة لكل مستخدم، و300 في الساعة لكل الزوّار معاً.
  IF _uid IS NOT NULL THEN
    IF (SELECT count(*) FROM public.client_errors
         WHERE user_id = _uid AND created_at > now() - interval '1 hour') >= 30 THEN
      RETURN false;
    END IF;
  ELSIF (SELECT count(*) FROM public.client_errors
          WHERE user_id IS NULL AND created_at > now() - interval '1 hour') >= 300 THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_errors (user_id, source, fingerprint, message, stack, url, user_agent, release)
  VALUES (_uid, _source, _fp, _msg, left(_stack, 4000), nullif(_path, ''),
          left(_user_agent, 300), left(_release, 64));

  -- احتفاظ 30 يوماً: تنظيف رخيص عند نحو 1% من النداءات.
  IF random() < 0.01 THEN
    DELETE FROM public.client_errors WHERE last_seen_at < now() - interval '30 days';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_error(text, text, text, text, text, text) FROM PUBLIC;
-- anon مقصود: أخطاء صفحات الدخول قبل الجلسة مهمّة، والحدّ الجماعي أعلاه يضبطها.
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text)
  TO anon, authenticated, service_role;

-- ملخّص لصاحب المشروع (من محرّر SQL في لوحة Supabase): أكثر الأخطاء تكراراً في 7 أيام.
CREATE OR REPLACE FUNCTION public.error_summary(_days integer DEFAULT 7)
RETURNS TABLE (message text, url text, source text, occurrences bigint, users bigint, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.message, e.url, e.source, sum(e.occurrences)::bigint, count(DISTINCT e.user_id)::bigint,
         max(e.last_seen_at)
    FROM public.client_errors e
   WHERE e.last_seen_at > now() - make_interval(days => greatest(1, least(_days, 90)))
   GROUP BY e.message, e.url, e.source
   ORDER BY 4 DESC
   LIMIT 100
$$;

REVOKE ALL ON FUNCTION public.error_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.error_summary(integer) TO service_role;
