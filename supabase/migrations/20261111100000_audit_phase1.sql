-- تدقيق أكتوبر 2026 — المرحلة 1 (صحة المنطق والتقوية الصغيرة)
--
-- 1.2  progress_stats: إجماليات سجل الحفظ على الخادم. كانت الواجهة تحسبها من آخر 200 سجل فقط
--      (listProgress .limit(200))، فتتجمّد أرقام الطالب الملتزم بعد بضعة أشهر.
-- 1.4  push_kick_allowed: حدّ معدّل لوضع «kick» في zen-push-dispatch (كان أي مستخدم يستدعيه بلا حدّ).
-- 1.5  zen_today: سحب التنفيذ من PUBLIC/anon (القاعدة 34)، فقد مُنح في 20260928100000 دون REVOKE.

-- ─── 1.2) إجماليات الحفظ ───
-- SECURITY INVOKER عمداً: سياسات RLS على progress (الطالب نفسه أو teaches_student أو ولي الأمر…) هي
-- الحَكَم، فلا يرى المستدعي إلا ما يحق له رؤيته صفاً صفاً. «الأيام» بتوقيت المستدعي (القاعدة 43).
CREATE OR REPLACE FUNCTION public.progress_stats(_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'ayat', COALESCE(sum(GREATEST(0, p.to_ayah - p.from_ayah + 1)), 0),
    'days', count(DISTINCT (p.created_at AT TIME ZONE COALESCE(private.caller_timezone(), 'Asia/Aden'))::date),
    'news', count(*) FILTER (WHERE p.memorization_type = 'new'),
    'revs', count(*) FILTER (WHERE p.memorization_type <> 'new')
  )
  FROM public.progress p
  WHERE p.user_id = _user;
$$;
REVOKE ALL ON FUNCTION public.progress_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.progress_stats(uuid) TO authenticated, service_role;

-- فهرس (user_id, created_at) يخدم القائمة المقيّدة والإجماليات معاً.
CREATE INDEX IF NOT EXISTS progress_user_created_idx ON public.progress (user_id, created_at DESC);

-- ─── 1.4) حدّ معدّل لـ «kick» ───
-- للخادم وحده (دالة Edge بمفتاح الخدمة). 6 نداءات في الدقيقة لكل مستخدم تكفي لكل إرسال حقيقي
-- (رسالة أو تقييم)، والمجدول (cron) يفرّغ الباقي كل دقيقة على أي حال.
CREATE OR REPLACE FUNCTION public.push_kick_allowed(_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public._auth_rate_hit('push_kick', _user::text, 6, interval '1 minute');
  RETURN true;
EXCEPTION
  WHEN SQLSTATE 'P0429' THEN
    RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.push_kick_allowed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_kick_allowed(uuid) TO service_role;

-- ─── 1.5) zen_today للجلسات فقط ───
REVOKE ALL ON FUNCTION public.zen_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zen_today() TO authenticated, service_role;
