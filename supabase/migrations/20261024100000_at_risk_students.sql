-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.4 — الإنذار المبكر
-- ════════════════════════════════════════════════════════════════════════════
-- at_risk_students(_halaqa) لمدير الحلقة (أو كل حلقاته عند NULL): الطلاب الذين تحقّق فيهم سبب واحد أو أكثر:
--   absences   3 غيابات متتالية أو أكثر (آخر سجلات الحضور في الحلقة، «معذور» لا يقطع ولا يُحسب)
--   low_grade  متوسط آخر 5 تقييمات معتمدة < 70 (أي دون «جيد» = 3 من 5)
--   overdue    أكثر من 20 مقطع مراجعة متأخراً
--   inactive   7 أيام أو أكثر بلا نشاط (تسميع أو مراجعة أو حضور)
-- لا يقرأ المحاسبة (خاصة بالطالب) ولا أي محتوى شخصي. التواريخ بتوقيت عدن (zen_today).

CREATE OR REPLACE FUNCTION public.at_risk_students(_halaqa uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  d date := public.zen_today();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _halaqa IS NOT NULL AND NOT private.manages_halaqa(caller, _halaqa) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;

  RETURN COALESCE((
    WITH hs AS (
      SELECT DISTINCT ON (s.student_id) s.student_id, s.halaqa_id, h.name AS halaqa_name
        FROM public.halaqa_students s
        JOIN public.halaqat h ON h.id = s.halaqa_id
       WHERE (_halaqa IS NULL AND private.manages_halaqa(caller, s.halaqa_id)) OR s.halaqa_id = _halaqa
       ORDER BY s.student_id, s.halaqa_id
    ),
    m AS (
      SELECT hs.*,
        -- الغيابات المتتالية من الأحدث حتى أول حضور/تأخر.
        (SELECT count(*) FROM (
            SELECT a.status, a.session_date
              FROM public.attendance a
             WHERE a.student_id = hs.student_id AND a.halaqa_id = hs.halaqa_id AND a.status <> 'excused'
             ORDER BY a.session_date DESC LIMIT 30) t
          WHERE t.status = 'absent'
            AND t.session_date > COALESCE((
              SELECT max(a2.session_date) FROM public.attendance a2
               WHERE a2.student_id = hs.student_id AND a2.halaqa_id = hs.halaqa_id
                 AND a2.status IN ('present', 'late')), '-infinity'::date)
        )::int AS absences,
        (SELECT round(avg(x.score))::int FROM (
            SELECT ra.score FROM public.recitation_assessments ra
             WHERE ra.student_id = hs.student_id AND ra.approved AND ra.score IS NOT NULL
             ORDER BY ra.created_at DESC LIMIT 5) x) AS avg_score,
        (SELECT count(*) FROM public.review_cards rc
          WHERE rc.student_id = hs.student_id AND rc.due_date < d)::int AS overdue,
        GREATEST(
          (SELECT max(rs.session_date) FROM public.recitation_sessions rs WHERE rs.student_id = hs.student_id),
          (SELECT max(rc.last_reviewed_at)::date FROM public.review_cards rc WHERE rc.student_id = hs.student_id),
          (SELECT max(a.session_date) FROM public.attendance a
            WHERE a.student_id = hs.student_id AND a.status IN ('present', 'late'))
        ) AS last_active,
        EXISTS (SELECT 1 FROM public.guardian_links gl WHERE gl.student_id = hs.student_id) AS has_guardian
      FROM hs
    ),
    r AS (
      SELECT m.*,
        array_remove(ARRAY[
          CASE WHEN m.absences >= 3 THEN 'absences' END,
          CASE WHEN m.avg_score IS NOT NULL AND m.avg_score < 70 THEN 'low_grade' END,
          CASE WHEN m.overdue > 20 THEN 'overdue' END,
          CASE WHEN m.last_active IS NULL OR m.last_active <= d - 7 THEN 'inactive' END
        ], NULL) AS reasons
      FROM m
    )
    SELECT jsonb_agg(jsonb_build_object(
             'student_id', r.student_id,
             'name', COALESCE(p.name, 'طالب'),
             'halaqa_id', r.halaqa_id,
             'halaqa_name', r.halaqa_name,
             'reasons', to_jsonb(r.reasons),
             'absences', r.absences,
             'avg_score', r.avg_score,
             'overdue', r.overdue,
             'inactive_days', CASE WHEN r.last_active IS NULL THEN NULL ELSE d - r.last_active END,
             'has_guardian', r.has_guardian)
           ORDER BY cardinality(r.reasons) DESC, r.absences DESC, p.name)
      FROM r
      LEFT JOIN public.profiles p ON p.id = r.student_id
     WHERE cardinality(r.reasons) > 0
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.at_risk_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.at_risk_students(uuid) TO authenticated, service_role;
