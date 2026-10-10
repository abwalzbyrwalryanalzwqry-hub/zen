-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 14.4 — أداء لوحة المركز
-- ════════════════════════════════════════════════════════════════════════════
-- اختبار الحمل (scripts/load-test.mjs: مركز بـ 500 طالب و20 حلقة) أظهر center_dashboard ≈ 1.7 ثانية:
-- استعلامات مرتبطة تمسح الحضور كله لكل طالب ولكل حلقة ولكل معلّم. الصيغة الجديدة تجمع كل مصدر مرة
-- واحدة (GROUP BY) ثم تربط، والمخرجات مطابقة حرفياً (يفحصها checks.sql 116 مقابل النسخة السابقة).
-- وفهارس لما تبحث به اللوحة وطابور اليوم.

CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON public.attendance (student_id, session_date DESC);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance (session_date);
CREATE INDEX IF NOT EXISTS recitation_assessments_student_created_idx
  ON public.recitation_assessments (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recitation_assessments_teacher_created_idx
  ON public.recitation_assessments (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recitation_sessions_student_created_idx
  ON public.recitation_sessions (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_results_student_created_idx ON public.exam_results (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assignments_teacher_created_idx ON public.assignments (teacher_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.center_dashboard(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 366);
  since date := current_date - days;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_center(auth.uid(), _center) THEN
    RAISE EXCEPTION 'لا تملك عرض لوحة هذا المركز.';
  END IF;

  -- نفس المخرجات حرفياً، لكن كل مصدر يُجمَّع مرة واحدة (GROUP BY) بدل استعلام مرتبط لكل طالب/حلقة/معلّم.
  WITH
  hq AS (
    SELECT h.id, h.name, h.teacher_id FROM public.halaqat h WHERE h.center_id = _center
  ),
  members AS (
    SELECT DISTINCT hs.halaqa_id, hs.student_id
      FROM public.halaqa_students hs JOIN hq ON hq.id = hs.halaqa_id
  ),
  students AS (SELECT DISTINCT student_id FROM members),
  att AS MATERIALIZED (
    SELECT a.student_id, a.halaqa_id, a.session_date, a.status, a.teacher_id
      FROM public.attendance a
     WHERE a.session_date > since
       AND (a.halaqa_id IN (SELECT id FROM hq)
            OR (a.halaqa_id IS NULL AND a.student_id IN (SELECT student_id FROM students)))
  ),
  -- حضور منسوب إلى حلقة (أو غير منسوب ⇒ لكل حلقة من حلقات الطالب).
  att_h AS (
    SELECT att.halaqa_id AS hid, att.status FROM att WHERE att.halaqa_id IS NOT NULL
    UNION ALL
    SELECT m.halaqa_id, att.status FROM att JOIN members m ON m.student_id = att.student_id
     WHERE att.halaqa_id IS NULL
  ),
  att_h_agg AS (
    SELECT hid,
           count(*) FILTER (WHERE status = 'present') AS present,
           count(*) FILTER (WHERE status = 'late') AS late,
           count(*) FILTER (WHERE status = 'absent') AS absent,
           count(*) FILTER (WHERE status = 'excused') AS excused
      FROM att_h GROUP BY hid
  ),
  att_s AS (
    SELECT student_id, count(*) AS total,
           count(*) FILTER (WHERE status IN ('present', 'late')) AS present
      FROM att GROUP BY student_id
  ),
  ra_since AS MATERIALIZED (
    SELECT ra.student_id, ra.teacher_id, ra.score, ra.created_at
      FROM public.recitation_assessments ra
     WHERE ra.created_at > since AND ra.student_id IN (SELECT student_id FROM students)
  ),
  ra_s AS (
    SELECT student_id, round(avg(score)) AS avg_score FROM ra_since
     WHERE score IS NOT NULL GROUP BY student_id
  ),
  ra_h AS (
    SELECT m.halaqa_id AS hid, count(*) AS n,
           round(avg(r.score) FILTER (WHERE r.score IS NOT NULL)) AS avg_score
      FROM ra_since r JOIN members m ON m.student_id = r.student_id GROUP BY m.halaqa_id
  ),
  ex_since AS MATERIALIZED (
    SELECT er.student_id, er.percentage FROM public.exam_results er
     WHERE er.created_at > since AND er.student_id IN (SELECT student_id FROM students)
  ),
  ex_h AS (
    SELECT m.halaqa_id AS hid, round(avg(e.percentage)) AS avg_exam
      FROM ex_since e JOIN members m ON m.student_id = e.student_id GROUP BY m.halaqa_id
  ),
  pages_s AS (
    SELECT mr.student_id, count(DISTINCT mr.page) AS pages FROM public.mushaf_records mr
     WHERE mr.kind = 'memorize' AND mr.session_date > since
       AND mr.student_id IN (SELECT student_id FROM students)
     GROUP BY mr.student_id
  ),
  -- آخر حضور وآخر ثلاث حالات: بحث بالفهرس (student_id, session_date DESC) لكل طالب، لا مسح للسجل كله.
  last_att AS (
    SELECT st.student_id, la.d FROM students st
      CROSS JOIN LATERAL (
        SELECT a.session_date AS d FROM public.attendance a
         WHERE a.student_id = st.student_id AND a.status IN ('present', 'late')
         ORDER BY a.session_date DESC LIMIT 1) la
  ),
  last_rs AS (
    SELECT rs.student_id, max(rs.created_at)::date AS d FROM public.recitation_sessions rs
     WHERE rs.student_id IN (SELECT student_id FROM students) GROUP BY rs.student_id
  ),
  last_mr AS (
    SELECT mr.student_id, max(mr.session_date) AS d FROM public.mushaf_records mr
     WHERE mr.student_id IN (SELECT student_id FROM students) GROUP BY mr.student_id
  ),
  last3 AS (
    SELECT st.student_id, l.s FROM students st
      CROSS JOIN LATERAL (
        SELECT array_agg(x.status) AS s FROM (
          SELECT a.status FROM public.attendance a
           WHERE a.student_id = st.student_id
           ORDER BY a.session_date DESC LIMIT 3) x) l
  ),
  hq_names AS (
    SELECT m.student_id, string_agg(hq.name, '، ' ORDER BY hq.name) AS halaqat
      FROM members m JOIN hq ON hq.id = m.halaqa_id GROUP BY m.student_id
  ),
  per_student AS MATERIALIZED (
    SELECT st.student_id,
           p.name,
           hn.halaqat,
           COALESCE(s.total, 0) AS att_total,
           COALESCE(s.present, 0) AS att_present,
           rs.avg_score,
           COALESCE(pg.pages, 0) AS pages,
           GREATEST(la.d, lr.d, lm.d) AS last_activity,
           l3.s AS last3
      FROM students st
      LEFT JOIN public.profiles p ON p.id = st.student_id
      LEFT JOIN hq_names hn ON hn.student_id = st.student_id
      LEFT JOIN att_s s ON s.student_id = st.student_id
      LEFT JOIN ra_s rs ON rs.student_id = st.student_id
      LEFT JOIN pages_s pg ON pg.student_id = st.student_id
      LEFT JOIN last_att la ON la.student_id = st.student_id
      LEFT JOIN last_rs lr ON lr.student_id = st.student_id
      LEFT JOIN last_mr lm ON lm.student_id = st.student_id
      LEFT JOIN last3 l3 ON l3.student_id = st.student_id
  ),
  pages_h AS (
    SELECT m.halaqa_id AS hid, sum(ps.pages) AS pages
      FROM members m JOIN per_student ps ON ps.student_id = m.student_id GROUP BY m.halaqa_id
  ),
  risk AS (
    SELECT ps.*,
           array_remove(ARRAY[
             CASE WHEN ps.att_total >= 3 AND ps.att_present * 100 < ps.att_total * 60
                  THEN 'low_attendance' END,
             CASE WHEN ps.last3 IS NOT NULL AND array_length(ps.last3, 1) = 3
                   AND ps.last3 <@ ARRAY['absent']::text[]
                  THEN 'absent_streak' END,
             CASE WHEN ps.avg_score IS NOT NULL AND ps.avg_score < 60 THEN 'low_score' END,
             CASE WHEN ps.last_activity IS NULL OR ps.last_activity < current_date - 14
                  THEN 'inactive' END
           ], NULL) AS reasons
      FROM per_student ps
  ),
  tch AS (SELECT DISTINCT teacher_id FROM hq WHERE teacher_id IS NOT NULL),
  att_t AS (
    SELECT att.teacher_id, count(*) AS n, max(att.session_date) AS d FROM att GROUP BY att.teacher_id
  ),
  ra_t AS (
    SELECT r.teacher_id, count(*) AS n FROM ra_since r GROUP BY r.teacher_id
  ),
  ra_t_last AS (
    SELECT ra.teacher_id, max(ra.created_at)::date AS d FROM public.recitation_assessments ra
     WHERE ra.teacher_id IN (SELECT teacher_id FROM tch)
       AND ra.student_id IN (SELECT student_id FROM students)
     GROUP BY ra.teacher_id
  ),
  asg_t AS (
    SELECT asg.teacher_id,
           count(*) FILTER (WHERE asg.created_at > since) AS n,
           max(asg.created_at)::date AS d
      FROM public.assignments asg
     WHERE asg.teacher_id IN (SELECT teacher_id FROM tch)
       AND asg.student_id IN (SELECT student_id FROM students)
     GROUP BY asg.teacher_id
  )
  SELECT jsonb_build_object(
    'center', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city)
                 FROM public.centers c WHERE c.id = _center),
    'period_days', days,
    'since', since,
    'can_manage', public.manages_center(auth.uid(), _center),
    'totals', jsonb_build_object(
      'halaqat', (SELECT count(*) FROM hq),
      'students', (SELECT count(*) FROM students),
      'teachers', (SELECT count(*) FROM tch),
      'weekly_slots', (SELECT count(*) FROM public.halaqa_schedule s WHERE s.halaqa_id IN (SELECT id FROM hq)),
      'attendance_records', (SELECT count(*) FROM att),
      'attendance_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                                 ELSE round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / count(*)) END
                            FROM att),
      'pages_memorized', (SELECT COALESCE(sum(pages), 0) FROM per_student),
      'assessments', (SELECT count(*) FROM ra_since),
      'avg_score', (SELECT round(avg(score)) FROM ra_since WHERE score IS NOT NULL),
      'exams', (SELECT count(*) FROM ex_since),
      'avg_exam', (SELECT round(avg(percentage)) FROM ex_since),
      'at_risk', (SELECT count(*) FROM risk WHERE cardinality(reasons) > 0)
    ),
    'halaqat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', hq.id,
               'name', hq.name,
               'teacher_id', hq.teacher_id,
               'teacher_name', tp.name,
               'students', (SELECT count(*) FROM members m WHERE m.halaqa_id = hq.id),
               'present', COALESCE(ah.present, 0),
               'late', COALESCE(ah.late, 0),
               'absent', COALESCE(ah.absent, 0),
               'excused', COALESCE(ah.excused, 0),
               'pages_memorized', COALESCE(ph.pages, 0),
               'assessments', COALESCE(rh.n, 0),
               'avg_score', rh.avg_score,
               'avg_exam', eh.avg_exam,
               'slots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                     'id', s.id, 'weekday', s.weekday,
                                     'start_time', to_char(s.start_time, 'HH24:MI'),
                                     'end_time', to_char(s.end_time, 'HH24:MI'),
                                     'location', s.location, 'online_url', s.online_url)
                                   ORDER BY s.weekday, s.start_time)
                                   FROM public.halaqa_schedule s WHERE s.halaqa_id = hq.id), '[]'::jsonb)
             ) ORDER BY hq.name)
        FROM hq
        LEFT JOIN public.profiles tp ON tp.id = hq.teacher_id
        LEFT JOIN att_h_agg ah ON ah.hid = hq.id
        LEFT JOIN pages_h ph ON ph.hid = hq.id
        LEFT JOIN ra_h rh ON rh.hid = hq.id
        LEFT JOIN ex_h eh ON eh.hid = hq.id), '[]'::jsonb),
    'teachers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.teacher_id,
               'name', tp.name,
               'halaqat', (SELECT count(*) FROM hq WHERE hq.teacher_id = t.teacher_id),
               'students', (SELECT count(DISTINCT m.student_id) FROM members m JOIN hq ON hq.id = m.halaqa_id
                             WHERE hq.teacher_id = t.teacher_id),
               'attendance_marked', COALESCE(at.n, 0),
               'assessments', COALESCE(rt.n, 0),
               'assignments', COALESCE(ag.n, 0),
               'last_activity', GREATEST(at.d, rl.d, ag.d)
             ) ORDER BY tp.name)
        FROM tch t
        LEFT JOIN public.profiles tp ON tp.id = t.teacher_id
        LEFT JOIN att_t at ON at.teacher_id = t.teacher_id
        LEFT JOIN ra_t rt ON rt.teacher_id = t.teacher_id
        LEFT JOIN ra_t_last rl ON rl.teacher_id = t.teacher_id
        LEFT JOIN asg_t ag ON ag.teacher_id = t.teacher_id), '[]'::jsonb),
    'at_risk', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
                 'id', r.student_id, 'name', COALESCE(r.name, 'طالب'), 'halaqat', r.halaqat,
                 'attendance_rate', CASE WHEN r.att_total = 0 THEN NULL
                                         ELSE round(100.0 * r.att_present / r.att_total) END,
                 'avg_score', r.avg_score,
                 'last_activity', r.last_activity,
                 'reasons', to_jsonb(r.reasons)) AS x
          FROM risk r
         WHERE cardinality(r.reasons) > 0
         ORDER BY cardinality(r.reasons) DESC, r.name
         LIMIT 50) s), '[]'::jsonb),
    'weekly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'week', w.week_start,
               'records', w.total,
               'rate', CASE WHEN w.total = 0 THEN NULL ELSE round(100.0 * w.ok / w.total) END)
             ORDER BY w.week_start)
        FROM (SELECT date_trunc('week', session_date)::date AS week_start,
                     count(*) AS total,
                     count(*) FILTER (WHERE status IN ('present', 'late')) AS ok
                FROM att GROUP BY 1) w), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
