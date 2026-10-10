-- ════════════════════════════════════════════════════════════════════════════
-- بيانات التقارير وسجل الإنجاز من السجل اليومي (الإصدار 1.11.0) — docs/REPORTS.md
-- ════════════════════════════════════════════════════════════════════════════
-- قراءة فقط: لا جدول جديد ولا نسخة من البيانات. السجل اليومي مصدر الحقيقة الوحيد:
--   الحضور من attendance، والملاحظة والتقييم من halaqa_register_entries، والحفظ والمراجعة ودرجتهما من
--   recitation_sessions/recitation_assessments المرتبطة بسجلات الأيام (halaqa_daily_records) — كما يقرؤها
--   daily_record_sheet تماماً، لكن لنطاق أيام ولطلاب مختارين في نداء واحد بدل يوم يوم.
-- التصفية (النطاق، والطلاب، وأيام الأسبوع) على الخادم، والحسابات كلها في محرّك واحد على الجهاز
-- (src/lib/reports/calc.ts) يستعمله سجل الإنجاز والمعاينة وPDF وExcel معاً، فلا حسابان مختلفان.
-- الصلاحية كالسجل اليومي: مدير الحلقة، أو طاقم المركز للقراءة (private.can_view_center).
-- _history: كل مقاطع الحفظ المعتمدة للطلاب المختارين حتى نهاية النطاق (لخريطة السور والمحطات).
-- الحدود: نطاق حتى 731 يوماً، وحتى 300 طالب، وحتى 20000 مقطع حفظ تاريخي (الأحدث).
-- التراجع: DROP FUNCTION public.halaqa_report_data(uuid, date, date, uuid[], smallint[], boolean);
-- الفحص: supabase/tests/checks.sql (143).

CREATE OR REPLACE FUNCTION public.halaqa_report_data(
  _halaqa uuid,
  _from date,
  _to date,
  _students uuid[] DEFAULT NULL,
  _weekdays smallint[] DEFAULT NULL,
  _history boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
  ids uuid[];
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > 731 THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF _students IS NOT NULL AND cardinality(_students) > 300 THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  IF _weekdays IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(_weekdays) w WHERE w IS NULL OR w NOT BETWEEN 0 AND 6) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) AND NOT private.can_view_center(caller, h.center_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;

  -- طلاب الحلقة الحاليون ومن له أثر في النطاق وإن انتقل (كالسجل اليومي، DR-13)، مقيَّدين بالمختارين.
  SELECT coalesce(array_agg(x.student_id), '{}') INTO ids FROM (
    SELECT hs.student_id FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa
    UNION
    SELECT a.student_id FROM public.attendance a
     WHERE a.halaqa_id = _halaqa AND a.session_date BETWEEN _from AND _to
    UNION
    SELECT e.student_id FROM public.halaqa_register_entries e
     WHERE e.halaqa_id = _halaqa AND e.session_date BETWEEN _from AND _to
    UNION
    SELECT s.student_id FROM public.recitation_sessions s
      JOIN public.halaqa_daily_records r ON r.id = s.daily_record_id
     WHERE r.halaqa_id = _halaqa AND r.record_date BETWEEN _from AND _to
  ) x WHERE _students IS NULL OR x.student_id = ANY (_students);

  RETURN jsonb_build_object(
    'halaqa', jsonb_build_object(
      'id', h.id, 'name', h.name,
      'teacher_name', (SELECT p.name FROM public.profiles p WHERE p.id = h.teacher_id),
      'center_name', (SELECT c.name FROM public.centers c WHERE c.id = h.center_id)),
    'from', _from,
    'to', _to,
    'today', public.zen_today(),
    'generated_at', now(),
    -- مواعيد الحلقة كما في إعداداتها (لا فترات مفترضة): أيام الأسبوع وأوقاتها.
    'schedule', coalesce((SELECT jsonb_agg(jsonb_build_object('weekday', sc.weekday, 'start', sc.start_time,
                                                                'end', sc.end_time) ORDER BY sc.weekday, sc.start_time)
                            FROM public.halaqa_schedule sc WHERE sc.halaqa_id = _halaqa), '[]'::jsonb),
    -- بترتيب الحلقة نفسه في السجل اليومي (الاسم ثم المعرّف).
    'students', coalesce((SELECT jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name', coalesce(p.name, ''),
                   'member', EXISTS (SELECT 1 FROM public.halaqa_students hs
                                      WHERE hs.halaqa_id = _halaqa AND hs.student_id = p.id))
                   ORDER BY coalesce(p.name, ''), p.id)
                 FROM public.profiles p WHERE p.id = ANY (ids)), '[]'::jsonb),
    'days', coalesce((SELECT jsonb_agg(jsonb_build_object('date', r.record_date, 'status', r.status,
                                                            'notes', r.notes) ORDER BY r.record_date)
                        FROM public.halaqa_daily_records r
                       WHERE r.halaqa_id = _halaqa AND r.record_date BETWEEN _from AND _to
                         AND (_weekdays IS NULL OR extract(dow FROM r.record_date)::smallint = ANY (_weekdays))),
                     '[]'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'date', k.d, 'student_id', k.sid,
               'status', a.status, 'reason', a.reason, 'note', e.note,
               'evaluation', CASE WHEN e.eval_overall IS NULL AND e.eval_tajweed IS NULL
                                       AND e.eval_pronunciation IS NULL AND e.eval_behavior IS NULL THEN NULL
                                  ELSE jsonb_build_object('overall', e.eval_overall, 'tajweed', e.eval_tajweed,
                                                          'pronunciation', e.eval_pronunciation,
                                                          'behavior', e.eval_behavior) END,
               'memorize', CASE WHEN r.id IS NULL THEN NULL ELSE private.daily_kind_json(r.id, k.sid, 'memorize') END,
               'review', CASE WHEN r.id IS NULL THEN NULL ELSE private.daily_kind_json(r.id, k.sid, 'review') END)
             ORDER BY k.d, k.sid)
        FROM (
          SELECT a2.session_date AS d, a2.student_id AS sid FROM public.attendance a2
           WHERE a2.halaqa_id = _halaqa AND a2.session_date BETWEEN _from AND _to
          UNION
          SELECT e2.session_date, e2.student_id FROM public.halaqa_register_entries e2
           WHERE e2.halaqa_id = _halaqa AND e2.session_date BETWEEN _from AND _to
          UNION
          SELECT r2.record_date, s2.student_id FROM public.recitation_sessions s2
            JOIN public.halaqa_daily_records r2 ON r2.id = s2.daily_record_id
           WHERE r2.halaqa_id = _halaqa AND r2.record_date BETWEEN _from AND _to
        ) k
        LEFT JOIN public.halaqa_daily_records r ON r.halaqa_id = _halaqa AND r.record_date = k.d
        LEFT JOIN public.attendance a ON a.halaqa_id = _halaqa AND a.session_date = k.d AND a.student_id = k.sid
        LEFT JOIN public.halaqa_register_entries e
               ON e.halaqa_id = _halaqa AND e.session_date = k.d AND e.student_id = k.sid
       WHERE k.sid = ANY (ids)
         AND (_weekdays IS NULL OR extract(dow FROM k.d)::smallint = ANY (_weekdays))), '[]'::jsonb),
    'history', CASE WHEN NOT coalesce(_history, false) THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object('student_id', z.student_id, 'date', z.session_date,
                                          'surah_name', z.surah_name, 'from_ayah', z.from_ayah,
                                          'to_ayah', z.to_ayah) ORDER BY z.session_date, z.created_at)
        FROM (SELECT s.student_id, s.session_date, s.surah_name, s.from_ayah, s.to_ayah, s.created_at
                FROM public.recitation_sessions s
               WHERE s.student_id = ANY (ids) AND s.kind = 'memorize' AND s.status = 'approved'
                 AND s.session_date <= _to
               ORDER BY s.session_date DESC, s.created_at DESC
               LIMIT 20000) z), '[]'::jsonb) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.halaqa_report_data(uuid, date, date, uuid[], smallint[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.halaqa_report_data(uuid, date, date, uuid[], smallint[], boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.halaqa_report_data(uuid, date, date, uuid[], smallint[], boolean) IS
  'بيانات التقارير وسجل الإنجاز لنطاق أيام من السجل اليومي (قراءة فقط، بصلاحية السجل نفسها). docs/REPORTS.md';
