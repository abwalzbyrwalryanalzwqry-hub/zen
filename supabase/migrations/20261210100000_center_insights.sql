-- ════════════════════════════════════════════════════════════════════════════
-- لوحة المدير والتفاعل (1.20.0، المرحلة 4 من خطة التطوير)
-- ════════════════════════════════════════════════════════════════════════════
-- 1) الفترة والمقارنة (center_period_compare): مؤشرات المركز في آخر _days يوماً وفي الفترة نفسها قبلها،
--    فيُعرض سهم التغيّر ونسبته لكل مؤشر. نافذة الفترة الحالية (اليوم - _days، اليوم] كما في center_dashboard.
-- 2) التعمّق (center_drilldown): صفّ لكل طالب في المركز بمؤشراته في الفترة (الحضور، الصفحات، التسميع،
--    الاختبارات، آخر نشاط)؛ الواجهة ترتّبه وتصفّيه بحسب المؤشر المضغوط. بالشرط نفسه (can_view_center).
-- 3) جودة الإدخال لكل معلّم (center_teacher_quality): أيامه المسجّلة، ونسبة ما أُغلق في يومه، والإغلاق بعد
--    منتصف الليل، والتعديلات بعد الإغلاق، وتنبيهات المراقب، وما علّم عليه المشرف في العيّنة. من بيانات المرحلة 2.
-- 4) ملخص المدير الأسبوعي (send_center_weekly_summaries): إشعار كل خميس لمنشئ المركز وطاقمه (مدير ومشرف)
--    بمؤشرات الأسبوع مقارنة بالأسبوع السابق، على غرار تقرير وليّ الأمر. يُوقفه مدير المركز (weekly_summary_enabled).
-- 5) دوري الحلقات (center_halaqa_league): مؤشرات جماعية لكل حلقة — الانتظام، ومتوسط التسميع، وإنجاز
--    التحديات — والترتيب بالتحسّن النسبي عن الفترة السابقة لا بالقيمة المطلقة، فلا تُحبَط الحلقة الضعيفة.
--    لا أسماء طلاب ولا ترتيب أفراد. معطّل افتراضياً، ويفعّله منشئ المركز أو مديره (halaqa_league_enabled).
-- إضافات فقط: عمودان في centers، وجدول إرسال، ودوال قراءة، ودالتا ضبط، وجدولة pg_cron.
-- التراجع:
--   SELECT cron.unschedule('zen-center-weekly');  -- إن وُجد pg_cron
--   DROP FUNCTION public.center_period_compare(uuid, integer), public.center_drilldown(uuid, integer),
--     public.center_teacher_quality(uuid, integer), public.center_halaqa_league(uuid, integer),
--     public.set_center_halaqa_league(uuid, boolean), public.set_center_weekly_summary(uuid, boolean),
--     public.my_halaqa_leagues(integer),
--     public.send_center_weekly_summaries(), private.center_window_stats(uuid, date, date),
--     private.center_weekly_text(uuid), private.halaqa_window_index(uuid, date, date);
--   DROP TABLE public.center_weekly_sent;
--   ALTER TABLE public.centers DROP COLUMN halaqa_league_enabled, DROP COLUMN weekly_summary_enabled;
-- الفحص: supabase/tests/checks.sql (157–159).

ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS halaqa_league_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS weekly_summary_enabled boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.centers.halaqa_league_enabled IS
  'دوري الحلقات (1.20.0): مؤشرات جماعية لكل حلقة بالتحسّن النسبي، يراها أعضاء حلقات المركز. يفعّله منشئ المركز أو مديره.';
COMMENT ON COLUMN public.centers.weekly_summary_enabled IS
  'ملخص المدير الأسبوعي (1.20.0): إشعار الخميس لمنشئ المركز وطاقمه.';

-- ─────────── مؤشرات نافذة زمنية للمركز (بلا فحص صلاحية: للدوال أدناه فقط) ───────────

CREATE OR REPLACE FUNCTION private.center_window_stats(_center uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  hq AS (SELECT h.id FROM public.halaqat h WHERE h.center_id = _center),
  students AS (
    SELECT DISTINCT hs.student_id FROM public.halaqa_students hs WHERE hs.halaqa_id IN (SELECT id FROM hq)
  ),
  att AS (
    SELECT a.student_id, a.status FROM public.attendance a
     WHERE a.session_date BETWEEN _from AND _to
       AND (a.halaqa_id IN (SELECT id FROM hq)
            OR (a.halaqa_id IS NULL AND a.student_id IN (SELECT student_id FROM students)))
  ),
  ra AS (
    SELECT r.score FROM public.recitation_assessments r
     WHERE r.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Aden')
       AND r.created_at < ((_to + 1)::timestamp AT TIME ZONE 'Asia/Aden')
       AND r.student_id IN (SELECT student_id FROM students)
  ),
  ex AS (
    SELECT e.percentage FROM public.exam_results e
     WHERE e.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Aden')
       AND e.created_at < ((_to + 1)::timestamp AT TIME ZONE 'Asia/Aden')
       AND e.student_id IN (SELECT student_id FROM students)
  ),
  pages AS (
    SELECT mr.student_id, count(DISTINCT mr.page) AS n FROM public.mushaf_records mr
     WHERE mr.kind = 'memorize' AND mr.session_date BETWEEN _from AND _to
       AND mr.student_id IN (SELECT student_id FROM students)
     GROUP BY mr.student_id
  ),
  active AS (
    SELECT student_id FROM att WHERE status IN ('present', 'late')
    UNION
    SELECT student_id FROM pages
    UNION
    SELECT rs.student_id FROM public.recitation_sessions rs
     WHERE rs.session_date BETWEEN _from AND _to AND rs.student_id IN (SELECT student_id FROM students)
  ),
  recs AS (
    SELECT d.record_date, d.first_completed_at FROM public.halaqa_daily_records d
     WHERE d.halaqa_id IN (SELECT id FROM hq) AND d.record_date BETWEEN _from AND _to
  )
  SELECT jsonb_build_object(
    'from', _from, 'to', _to,
    'students', (SELECT count(*) FROM students),
    'active_students', (SELECT count(*) FROM active),
    'attendance_records', (SELECT count(*) FROM att),
    'attendance_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                               ELSE round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / count(*)) END
                          FROM att),
    'pages_memorized', (SELECT COALESCE(sum(n), 0) FROM pages),
    'assessments', (SELECT count(*) FROM ra),
    'avg_score', (SELECT round(avg(score)) FROM ra WHERE score IS NOT NULL),
    'exams', (SELECT count(*) FROM ex),
    'avg_exam', (SELECT round(avg(percentage)) FROM ex),
    'records', (SELECT count(*) FROM recs),
    'same_day_rate', (SELECT CASE WHEN count(*) FILTER (WHERE first_completed_at IS NOT NULL) = 0 THEN NULL
                             ELSE round(100.0 * count(*) FILTER (
                                    WHERE (first_completed_at AT TIME ZONE 'Asia/Aden')::date = record_date)
                                  / count(*) FILTER (WHERE first_completed_at IS NOT NULL)) END FROM recs),
    'edits_after_close', (SELECT count(*) FROM public.daily_record_audit a
                           WHERE a.halaqa_id IN (SELECT id FROM hq) AND a.action = 'edit'
                             AND a.before IS DISTINCT FROM a.after
                             AND a.record_date BETWEEN _from AND _to)
  )
$$;
REVOKE ALL ON FUNCTION private.center_window_stats(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ─────────── 1) الفترة والمقارنة ───────────

CREATE OR REPLACE FUNCTION public.center_period_compare(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  days integer := LEAST(GREATEST(COALESCE(_days, 30), 7), 180);
  today date := public.zen_today();
BEGIN
  IF caller IS NULL OR NOT private.can_view_center(caller, _center) THEN
    RAISE EXCEPTION 'لا تملك عرض لوحة هذا المركز.';
  END IF;
  RETURN jsonb_build_object(
    'days', days,
    'current', private.center_window_stats(_center, today - days + 1, today),
    'previous', private.center_window_stats(_center, today - 2 * days + 1, today - days));
END;
$$;
REVOKE ALL ON FUNCTION public.center_period_compare(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_period_compare(uuid, integer) TO authenticated;

-- ─────────── 2) التعمّق: صفّ لكل طالب ───────────

CREATE OR REPLACE FUNCTION public.center_drilldown(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 366);
  since date := public.zen_today() - LEAST(GREATEST(COALESCE(_days, 30), 1), 366);
BEGIN
  IF caller IS NULL OR NOT private.can_view_center(caller, _center) THEN
    RAISE EXCEPTION 'لا تملك عرض لوحة هذا المركز.';
  END IF;
  RETURN jsonb_build_object('days', days, 'students', COALESCE((
    WITH
    hq AS (SELECT h.id, h.name FROM public.halaqat h WHERE h.center_id = _center),
    members AS (SELECT DISTINCT hs.halaqa_id, hs.student_id FROM public.halaqa_students hs
                 WHERE hs.halaqa_id IN (SELECT id FROM hq)),
    st AS (SELECT DISTINCT student_id FROM members),
    att AS (
      SELECT a.student_id, count(*) AS total,
             count(*) FILTER (WHERE a.status IN ('present', 'late')) AS present,
             count(*) FILTER (WHERE a.status = 'absent') AS absent
        FROM public.attendance a
       WHERE a.session_date > since AND a.student_id IN (SELECT student_id FROM st)
         AND (a.halaqa_id IN (SELECT id FROM hq) OR a.halaqa_id IS NULL)
       GROUP BY a.student_id),
    ra AS (
      SELECT r.student_id, count(*) AS n, round(avg(r.score) FILTER (WHERE r.score IS NOT NULL)) AS avg_score
        FROM public.recitation_assessments r
       WHERE r.created_at > since AND r.student_id IN (SELECT student_id FROM st) GROUP BY r.student_id),
    ex AS (
      SELECT e.student_id, round(avg(e.percentage)) AS avg_exam FROM public.exam_results e
       WHERE e.created_at > since AND e.student_id IN (SELECT student_id FROM st) GROUP BY e.student_id),
    pg AS (
      SELECT mr.student_id, count(DISTINCT mr.page) AS pages FROM public.mushaf_records mr
       WHERE mr.kind = 'memorize' AND mr.session_date > since AND mr.student_id IN (SELECT student_id FROM st)
       GROUP BY mr.student_id),
    last_act AS (
      SELECT s.student_id, GREATEST(
               (SELECT max(a.session_date) FROM public.attendance a
                 WHERE a.student_id = s.student_id AND a.status IN ('present', 'late')),
               (SELECT max(mr.session_date) FROM public.mushaf_records mr WHERE mr.student_id = s.student_id),
               (SELECT max(rs.session_date) FROM public.recitation_sessions rs WHERE rs.student_id = s.student_id)
             ) AS d
        FROM st s),
    names AS (
      SELECT m.student_id, string_agg(hq.name, '، ' ORDER BY hq.name) AS halaqat,
             (array_agg(m.halaqa_id ORDER BY hq.name))[1] AS halaqa_id
        FROM members m JOIN hq ON hq.id = m.halaqa_id GROUP BY m.student_id)
    SELECT jsonb_agg(jsonb_build_object(
             'student_id', s.student_id, 'name', COALESCE(p.name, 'طالب'),
             'halaqat', n.halaqat, 'halaqa_id', n.halaqa_id,
             'attendance_total', COALESCE(a.total, 0),
             'absent', COALESCE(a.absent, 0),
             'attendance_rate', CASE WHEN COALESCE(a.total, 0) = 0 THEN NULL
                                     ELSE round(100.0 * a.present / a.total) END,
             'pages', COALESCE(g.pages, 0),
             'assessments', COALESCE(r.n, 0),
             'avg_score', r.avg_score,
             'avg_exam', e.avg_exam,
             'last_activity', la.d)
           ORDER BY p.name)
      FROM st s
      LEFT JOIN public.profiles p ON p.id = s.student_id
      LEFT JOIN names n ON n.student_id = s.student_id
      LEFT JOIN att a ON a.student_id = s.student_id
      LEFT JOIN ra r ON r.student_id = s.student_id
      LEFT JOIN ex e ON e.student_id = s.student_id
      LEFT JOIN pg g ON g.student_id = s.student_id
      LEFT JOIN last_act la ON la.student_id = s.student_id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.center_drilldown(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_drilldown(uuid, integer) TO authenticated;

-- ─────────── 3) جودة الإدخال لكل معلّم ───────────

CREATE OR REPLACE FUNCTION public.center_teacher_quality(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  days integer := greatest(7, least(coalesce(_days, 30), 90));
  today date := public.zen_today();
  since date := public.zen_today() - (greatest(7, least(coalesce(_days, 30), 90)) - 1);
  out jsonb := '[]'::jsonb;
  t record;
  h record;
  a jsonb;
  warnings integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.can_view_center(caller, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  FOR t IN
    SELECT hq.teacher_id, COALESCE(p.name, 'معلّم') AS name, array_agg(hq.id) AS halaqat
      FROM public.halaqat hq LEFT JOIN public.profiles p ON p.id = hq.teacher_id
     WHERE hq.center_id = _center AND hq.teacher_id IS NOT NULL
     GROUP BY hq.teacher_id, p.name ORDER BY p.name
  LOOP
    warnings := 0;
    FOR h IN SELECT unnest(t.halaqat) AS id LOOP
      a := public.daily_record_anomalies(h.id, days);
      warnings := warnings + (SELECT count(*) FROM jsonb_array_elements(a -> 'items') i
                               WHERE i ->> 'code' NOT IN ('edits_after_close', 'perfect_attendance'));
    END LOOP;
    out := out || jsonb_build_array((
      SELECT jsonb_build_object(
        'teacher_id', t.teacher_id, 'name', t.name, 'halaqat', cardinality(t.halaqat),
        'records', count(*),
        'closed', count(*) FILTER (WHERE d.first_completed_at IS NOT NULL),
        'same_day', count(*) FILTER (WHERE (d.first_completed_at AT TIME ZONE 'Asia/Aden')::date = d.record_date),
        'same_day_rate', CASE WHEN count(*) FILTER (WHERE d.first_completed_at IS NOT NULL) = 0 THEN NULL
                              ELSE round(100.0 * count(*) FILTER (
                                     WHERE (d.first_completed_at AT TIME ZONE 'Asia/Aden')::date = d.record_date)
                                   / count(*) FILTER (WHERE d.first_completed_at IS NOT NULL)) END,
        'late_closes', count(*) FILTER (WHERE (d.first_completed_at AT TIME ZONE 'Asia/Aden')::date > d.record_date),
        'edits_after_close', (SELECT count(*) FROM public.daily_record_audit x
                               WHERE x.halaqa_id = ANY (t.halaqat) AND x.action = 'edit'
                                 AND x.before IS DISTINCT FROM x.after AND x.record_date BETWEEN since AND today),
        'warnings', warnings,
        'reviewed', (SELECT count(*) FROM public.daily_record_reviews r
                       JOIN public.halaqa_daily_records rd ON rd.id = r.record_id
                      WHERE rd.halaqa_id = ANY (t.halaqat) AND rd.record_date BETWEEN since AND today),
        'flagged', (SELECT count(*) FROM public.daily_record_reviews r
                      JOIN public.halaqa_daily_records rd ON rd.id = r.record_id
                     WHERE rd.halaqa_id = ANY (t.halaqat) AND NOT r.ok AND rd.record_date BETWEEN since AND today))
        FROM public.halaqa_daily_records d
       WHERE d.halaqa_id = ANY (t.halaqat) AND d.record_date BETWEEN since AND today));
  END LOOP;
  RETURN jsonb_build_object('center_id', _center, 'days', days, 'teachers', out);
END;
$$;
REVOKE ALL ON FUNCTION public.center_teacher_quality(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_teacher_quality(uuid, integer) TO authenticated;

-- ─────────── 4) ملخص المدير الأسبوعي ───────────

CREATE TABLE IF NOT EXISTS public.center_weekly_sent (
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (center_id, user_id, week_start)
);
CREATE INDEX IF NOT EXISTS center_weekly_sent_user_idx ON public.center_weekly_sent (user_id);
ALTER TABLE public.center_weekly_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.center_weekly_sent FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.center_weekly_sent TO service_role;

/** نص الملخص: آخر 7 أيام مقابل السبعة قبلها. */
CREATE OR REPLACE FUNCTION private.center_weekly_text(_center uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := public.zen_today();
  cur jsonb := private.center_window_stats(_center, today - 6, today);
  prev jsonb := private.center_window_stats(_center, today - 13, today - 7);
  delta text := '';
  inactive integer;
BEGIN
  IF (cur ->> 'attendance_rate') IS NOT NULL AND (prev ->> 'attendance_rate') IS NOT NULL THEN
    delta := CASE
      WHEN (cur ->> 'attendance_rate')::int > (prev ->> 'attendance_rate')::int
        THEN ' (↑' || ((cur ->> 'attendance_rate')::int - (prev ->> 'attendance_rate')::int) || ')'
      WHEN (cur ->> 'attendance_rate')::int < (prev ->> 'attendance_rate')::int
        THEN ' (↓' || ((prev ->> 'attendance_rate')::int - (cur ->> 'attendance_rate')::int) || ')'
      ELSE ' (=)' END;
  END IF;
  SELECT count(*) INTO inactive FROM (
    SELECT DISTINCT hs.student_id FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE h.center_id = _center) s
   WHERE NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.student_id = s.student_id
                       AND a.status IN ('present', 'late') AND a.session_date > today - 14)
     AND NOT EXISTS (SELECT 1 FROM public.mushaf_records mr WHERE mr.student_id = s.student_id
                       AND mr.session_date > today - 14);
  RETURN concat_ws(' · ',
    CASE WHEN (cur ->> 'attendance_rate') IS NOT NULL
         THEN 'الحضور ' || (cur ->> 'attendance_rate') || '%' || delta ELSE 'لا حضور مسجّل' END,
    'حفظ ' || (cur ->> 'pages_memorized') || ' صفحة (السابق ' || (prev ->> 'pages_memorized') || ')',
    CASE WHEN (cur ->> 'assessments')::int > 0
         THEN (cur ->> 'assessments') || ' تسميع' || COALESCE(' بمتوسط ' || (cur ->> 'avg_score'), '') END,
    'نشط ' || (cur ->> 'active_students') || ' من ' || (cur ->> 'students'),
    CASE WHEN inactive > 0 THEN inactive || ' بلا نشاط منذ أسبوعين' END,
    CASE WHEN (cur ->> 'edits_after_close')::int > 0
         THEN (cur ->> 'edits_after_close') || ' تعديل بعد الإغلاق' END);
END;
$$;
REVOKE ALL ON FUNCTION private.center_weekly_text(uuid) FROM PUBLIC, anon, authenticated;

-- للخادم فقط (pg_cron أو service_role). مرة واحدة في الأسبوع لكل (مركز، مستلم). يعيد عدد الإشعارات.
CREATE OR REPLACE FUNCTION public.send_center_weekly_summaries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wk date := date_trunc('week', public.zen_today())::date;
  sent integer := 0;
  c record;
  msg text;
BEGIN
  FOR c IN
    SELECT ce.id, ce.name FROM public.centers ce
     WHERE ce.weekly_summary_enabled
       AND EXISTS (SELECT 1 FROM public.halaqat h WHERE h.center_id = ce.id)
  LOOP
    msg := private.center_weekly_text(c.id);
    WITH rcpt AS (
      SELECT ce.created_by AS user_id FROM public.centers ce WHERE ce.id = c.id AND ce.created_by IS NOT NULL
      UNION
      SELECT s.user_id FROM public.center_staff s WHERE s.center_id = c.id
    ), fresh AS (
      INSERT INTO public.center_weekly_sent (center_id, user_id, week_start)
      SELECT c.id, r.user_id, wk FROM rcpt r
       WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id)
      ON CONFLICT DO NOTHING
      RETURNING user_id
    ), ins AS (
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      SELECT f.user_id, 'center_weekly', 'ملخص الأسبوع: ' || c.name, msg, '/center/' || c.id FROM fresh f
      RETURNING 1
    )
    SELECT sent + count(*) INTO sent FROM ins;
  END LOOP;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_center_weekly_summaries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_center_weekly_summaries() TO service_role;

CREATE OR REPLACE FUNCTION public.set_center_weekly_summary(_center uuid, _on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR _on IS NULL OR NOT private.manages_center((SELECT auth.uid()), _center) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.centers SET weekly_summary_enabled = _on WHERE id = _center;
END;
$$;
REVOKE ALL ON FUNCTION public.set_center_weekly_summary(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_center_weekly_summary(uuid, boolean) TO authenticated;

-- كل خميس 15:05 UTC (18:05 بتوقيت صنعاء)، بعد تقرير وليّ الأمر بخمس دقائق.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-center-weekly';
    PERFORM cron.schedule('zen-center-weekly', '5 15 * * 4', 'SELECT public.send_center_weekly_summaries()');
  END IF;
END $$;

-- ─────────── 5) دوري الحلقات ───────────

/** مؤشر الحلقة في نافذة: الانتظام، ومتوسط التسميع، وإنجاز تحدياتها (نسبة)، ومتوسط ما توفّر منها. */
CREATE OR REPLACE FUNCTION private.halaqa_window_index(_halaqa uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  m AS (SELECT hs.student_id FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa),
  att AS (SELECT a.status FROM public.attendance a
           WHERE a.halaqa_id = _halaqa AND a.session_date BETWEEN _from AND _to),
  ra AS (SELECT r.score FROM public.recitation_assessments r
          WHERE r.student_id IN (SELECT student_id FROM m) AND r.score IS NOT NULL
            AND r.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Aden')
            AND r.created_at < ((_to + 1)::timestamp AT TIME ZONE 'Asia/Aden')),
  ch AS (
    SELECT LEAST(100, round(100.0 * (CASE WHEN c.kind = 'khatma'
             THEN (SELECT count(*) FROM public.challenge_parts p WHERE p.challenge_id = c.id AND p.done_at IS NOT NULL)
             ELSE (SELECT COALESCE(sum(l.pages), 0) FROM public.challenge_logs l WHERE l.challenge_id = c.id) END)
             / c.target)) AS pct
      FROM public.halaqa_challenges c
     WHERE c.halaqa_id = _halaqa AND c.starts_on <= _to AND c.ends_on >= _from),
  v AS (
    SELECT (SELECT CASE WHEN count(*) = 0 THEN NULL
                        ELSE round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / count(*)) END
              FROM att) AS regularity,
           (SELECT round(avg(score)) FROM ra) AS avg_score,
           (SELECT round(avg(pct)) FROM ch) AS challenges
  )
  SELECT jsonb_build_object(
    'regularity', v.regularity, 'avg_score', v.avg_score, 'challenges', v.challenges,
    'index', (SELECT round(avg(x)) FROM unnest(ARRAY[v.regularity, v.avg_score, v.challenges]) AS x))
    FROM v
$$;
REVOKE ALL ON FUNCTION private.halaqa_window_index(uuid, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.center_halaqa_league(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  days integer := LEAST(GREATEST(COALESCE(_days, 30), 7), 90);
  today date := public.zen_today();
  staff boolean;
  enabled boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT c.halaqa_league_enabled INTO enabled FROM public.centers c WHERE c.id = _center;
  IF enabled IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  staff := private.can_view_center(caller, _center);
  -- أعضاء الحلقات ومعلّموها يرونه حين يُفعَّل فقط؛ وطاقم المركز يراه دائماً (معاينة قبل التفعيل).
  IF NOT staff AND NOT (enabled AND EXISTS (
      SELECT 1 FROM public.halaqat h WHERE h.center_id = _center AND private.can_view_schedule(caller, h.id))) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  RETURN jsonb_build_object('center_id', _center, 'enabled', enabled, 'days', days, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'halaqa_id', x.id, 'name', x.name, 'students', x.students,
             'mine', x.mine,
             'regularity', x.cur -> 'regularity', 'avg_score', x.cur -> 'avg_score',
             'challenges', x.cur -> 'challenges', 'index', x.cur -> 'index',
             'index_prev', x.prev -> 'index',
             'change', CASE WHEN x.cur ->> 'index' IS NULL OR x.prev ->> 'index' IS NULL THEN NULL
                            ELSE (x.cur ->> 'index')::int - (x.prev ->> 'index')::int END,
             'rank', x.rnk)
           ORDER BY x.rnk)
      FROM (
        SELECT y.*, rank() OVER (ORDER BY
                 CASE WHEN y.cur ->> 'index' IS NULL OR y.prev ->> 'index' IS NULL THEN NULL
                      ELSE (y.cur ->> 'index')::int - (y.prev ->> 'index')::int END DESC NULLS LAST,
                 (y.cur ->> 'index')::int DESC NULLS LAST) AS rnk
          FROM (
            SELECT h.id, h.name,
                   (SELECT count(*) FROM public.halaqa_students hs WHERE hs.halaqa_id = h.id) AS students,
                   private.can_view_schedule(caller, h.id) AS mine,
                   private.halaqa_window_index(h.id, today - days + 1, today) AS cur,
                   private.halaqa_window_index(h.id, today - 2 * days + 1, today - days) AS prev
              FROM public.halaqat h WHERE h.center_id = _center) y) x), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.center_halaqa_league(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_halaqa_league(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_center_halaqa_league(_center uuid, _on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR _on IS NULL OR NOT private.manages_center((SELECT auth.uid()), _center) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.centers SET halaqa_league_enabled = _on WHERE id = _center;
END;
$$;
REVOKE ALL ON FUNCTION public.set_center_halaqa_league(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_center_halaqa_league(uuid, boolean) TO authenticated;

/** الدوري لكل مركز فعّله ويدرس فيه المستدعي أو يدرّس (صفحة الإنجازات). مصفوفة فارغة إن لم يوجد. */
CREATE OR REPLACE FUNCTION public.my_halaqa_leagues(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  out jsonb := '[]'::jsonb;
  c record;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  FOR c IN
    SELECT DISTINCT ce.id, ce.name FROM public.centers ce JOIN public.halaqat h ON h.center_id = ce.id
     WHERE ce.halaqa_league_enabled AND private.can_view_schedule(caller, h.id)
     ORDER BY ce.name
  LOOP
    out := out || jsonb_build_array(public.center_halaqa_league(c.id, _days) || jsonb_build_object('center_name', c.name));
  END LOOP;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.my_halaqa_leagues(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_halaqa_leagues(integer) TO authenticated;
