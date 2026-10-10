-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 10.3 — مؤشرات المركز: الحفظ الشهري والانتظام والتسرّب لكل حلقة، والاتجاه الشهري
-- ════════════════════════════════════════════════════════════════════════════
-- امتداد لـ center_dashboard بدالة مستقلة (تُحمَّل مع الرسوم عند فتح القسم فقط)، وبالشرط نفسه
-- can_view_center (القاعدة 11). «التسرّب» = عضو حالي بلا أي نشاط (حضور/حفظ/تسميع) منذ 30 يوماً.
-- لا أسماء طلاب هنا: أعداد ونِسب فقط.

CREATE OR REPLACE FUNCTION public.center_kpis(_center uuid, _months integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months integer := LEAST(GREATEST(COALESCE(_months, 6), 1), 12);
  first_month date := (date_trunc('month', current_date) - make_interval(months => months - 1))::date;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_center(auth.uid(), _center) THEN
    RAISE EXCEPTION 'لا تملك عرض لوحة هذا المركز.';
  END IF;

  WITH
  hq AS (SELECT h.id, h.name FROM public.halaqat h WHERE h.center_id = _center),
  members AS (
    SELECT DISTINCT hs.halaqa_id, hs.student_id FROM public.halaqa_students hs JOIN hq ON hq.id = hs.halaqa_id
  ),
  students AS (SELECT DISTINCT student_id FROM members),
  -- نشاط كل طالب يوماً بيوم منذ أول شهر في النافذة.
  activity AS (
    SELECT a.student_id, a.session_date AS d FROM public.attendance a
     WHERE a.status IN ('present', 'late') AND a.session_date >= first_month
       AND a.student_id IN (SELECT student_id FROM students)
    UNION
    SELECT mr.student_id, mr.session_date FROM public.mushaf_records mr
     WHERE mr.session_date >= first_month AND mr.student_id IN (SELECT student_id FROM students)
    UNION
    SELECT rs.student_id, rs.created_at::date FROM public.recitation_sessions rs
     WHERE rs.created_at >= first_month AND rs.student_id IN (SELECT student_id FROM students)
  ),
  last_act AS (
    SELECT st.student_id,
           GREATEST(
             (SELECT max(a.session_date) FROM public.attendance a
               WHERE a.student_id = st.student_id AND a.status IN ('present', 'late')),
             (SELECT max(mr.session_date) FROM public.mushaf_records mr WHERE mr.student_id = st.student_id),
             (SELECT max(rs.created_at)::date FROM public.recitation_sessions rs WHERE rs.student_id = st.student_id)
           ) AS last_activity
      FROM students st
  ),
  mem30 AS (
    SELECT DISTINCT mr.student_id, mr.page FROM public.mushaf_records mr
     WHERE mr.kind = 'memorize' AND mr.session_date > current_date - 30
       AND mr.student_id IN (SELECT student_id FROM students)
  ),
  att30 AS (
    SELECT a.halaqa_id, a.student_id, a.status FROM public.attendance a
     WHERE a.session_date > current_date - 30 AND a.halaqa_id IN (SELECT id FROM hq)
  ),
  per_halaqa AS (
    SELECT hq.id, hq.name,
           (SELECT count(*) FROM members m WHERE m.halaqa_id = hq.id) AS students,
           (SELECT count(*) FROM mem30 x WHERE x.student_id IN (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)) AS pages_30,
           (SELECT CASE WHEN count(*) = 0 THEN NULL
                        ELSE round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / count(*)) END
              FROM att30 WHERE att30.halaqa_id = hq.id) AS regularity,
           (SELECT count(*) FROM members m JOIN last_act la ON la.student_id = m.student_id
             WHERE m.halaqa_id = hq.id
               AND (la.last_activity IS NULL OR la.last_activity <= current_date - 30)) AS dropouts
      FROM hq
  ),
  month_list AS (
    SELECT generate_series(first_month, date_trunc('month', current_date)::date, interval '1 month')::date AS m
  )
  SELECT jsonb_build_object(
    'months', months,
    'halaqat', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'students', p.students,
        'pages_30', p.pages_30,
        'pages_per_student', CASE WHEN p.students = 0 THEN NULL ELSE round(p.pages_30::numeric / p.students, 1) END,
        'regularity', p.regularity,
        'dropouts', p.dropouts,
        'dropout_rate', CASE WHEN p.students = 0 THEN NULL ELSE round(100.0 * p.dropouts / p.students) END)
        ORDER BY p.name) FROM per_halaqa p), '[]'::jsonb),
    'totals', jsonb_build_object(
        'students', (SELECT count(*) FROM students),
        'pages_30', (SELECT count(*) FROM mem30),
        'dropouts', (SELECT count(*) FROM last_act
                      WHERE last_activity IS NULL OR last_activity <= current_date - 30),
        'regularity', (SELECT CASE WHEN count(*) = 0 THEN NULL
                               ELSE round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / count(*)) END
                         FROM att30)),
    'monthly', (SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(ml.m, 'YYYY-MM'),
        'pages', (SELECT count(*) FROM (SELECT DISTINCT mr.student_id, mr.page FROM public.mushaf_records mr
                    WHERE mr.kind = 'memorize' AND mr.session_date >= ml.m
                      AND mr.session_date < (ml.m + interval '1 month')::date
                      AND mr.student_id IN (SELECT student_id FROM students)) z),
        'attendance_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                               ELSE round(100.0 * count(*) FILTER (WHERE a.status IN ('present', 'late')) / count(*)) END
                              FROM public.attendance a
                             WHERE a.halaqa_id IN (SELECT id FROM hq) AND a.session_date >= ml.m
                               AND a.session_date < (ml.m + interval '1 month')::date),
        'active_students', (SELECT count(DISTINCT ac.student_id) FROM activity ac
                             WHERE ac.d >= ml.m AND ac.d < (ml.m + interval '1 month')::date))
        ORDER BY ml.m) FROM month_list ml)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.center_kpis(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_kpis(uuid, integer) TO authenticated;
