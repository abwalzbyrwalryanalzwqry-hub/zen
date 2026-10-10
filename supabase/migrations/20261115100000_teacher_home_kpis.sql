-- فحص الأقسام P1: مؤشرات رئيسية المعلّم في نداء واحد (docs/SECTIONS_AUDIT.md §9).
-- العدّ من الخادم (لا من صفوف محمَّلة في الواجهة)، ومحصور بحلقات المعلّم المتصل.
CREATE OR REPLACE FUNCTION public.teacher_home_kpis()
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
  IF NOT public.is_teacher(caller) THEN RAISE EXCEPTION 'TEACHER_ONLY'; END IF;

  RETURN (
    WITH mine AS (
      SELECT DISTINCT hs.student_id
        FROM public.halaqa_students hs
        JOIN public.halaqat h ON h.id = hs.halaqa_id
       WHERE h.teacher_id = caller
    ),
    today AS (
      SELECT a.status
        FROM public.attendance a
        JOIN public.halaqat h ON h.id = a.halaqa_id
       WHERE h.teacher_id = caller AND a.session_date = d
    )
    SELECT jsonb_build_object(
      'students', (SELECT count(*) FROM mine),
      'pending_recitations', (
        SELECT count(*) FROM public.recitation_sessions r
         WHERE r.status = 'awaiting_teacher' AND r.student_id IN (SELECT student_id FROM mine)),
      'attendance_marked', (SELECT count(*) FROM today),
      'attendance_present', (SELECT count(*) FROM today WHERE status IN ('present', 'late')),
      'due_assignments', (
        SELECT count(*) FROM public.assignments x
         WHERE x.teacher_id = caller AND x.status IN ('pending', 'redo') AND x.due_date <= d),
      'at_risk', jsonb_array_length(public.at_risk_students(NULL))
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_home_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_home_kpis() TO authenticated;

COMMENT ON FUNCTION public.teacher_home_kpis() IS
  'مؤشرات رئيسية المعلّم: الطلاب، والتسميعات المنتظرة، وحضور اليوم، والواجبات المستحقة، والمتعثّرون.';
