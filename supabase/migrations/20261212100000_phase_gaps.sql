-- ════════════════════════════════════════════════════════════════════════════
-- إكمال فجوات المراحل 0–3 (الإصدار 1.21.1)
-- ════════════════════════════════════════════════════════════════════════════
-- 1) الاحتفاظ بأثر التدقيق سنة واحدة (مخاطر الخطة: «احتفظ ببيانات التدقيق سنة»):
--    public.purge_old_record_audit() تحذف من daily_record_audit ما مضى عليه أكثر من 365 يوماً، ومن
--    daily_record_reviews (ملاحظات عيّنة المشرف) ما مضى عليه أكثر من 365 يوماً، ومن fee_reminders_sent ما
--    مضى عليه أكثر من 400 يوم (لا يُعاد التذكير بمستحق قديم لأن التذكير ليوم الاستحقاق وبعد أسبوع فقط).
--    للخادم وحده (service_role)، ومهمة pg_cron يومية «zen-audit-retention» 03:41 UTC، دفعات حتى 20000 صف.
-- 2) «التعديلات بعد الإغلاق» في تقرير الحلقة: halaqa_report_data تعيد لكل يوم edits_after_close (عدد
--    العمليات المسجّلة في daily_record_audit بنوع edit لذلك اليوم)، فيظهر في ملخص التقرير «أيام عُدّلت بعد
--    الإغلاق» (src/lib/reports/sections.ts). بقية الدالة كما في 20261130100000_halaqa_report_data.sql حرفياً.
-- التراجع: DROP FUNCTION public.purge_old_record_audit(); SELECT cron.unschedule('zen-audit-retention');
--   ثم إعادة تشغيل 20261130100000_halaqa_report_data.sql لإرجاع الدالة بلا الحقل الجديد.
-- الفحص: supabase/tests/checks.sql (163، 164).


-- ─────────── 1. الاحتفاظ سنة ───────────

CREATE OR REPLACE FUNCTION public.purge_old_record_audit(_days integer DEFAULT 365)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keep integer := greatest(coalesce(_days, 365), 365);
  n_audit integer;
  n_reviews integer;
  n_reminders integer;
BEGIN
  WITH old AS (
    SELECT id FROM public.daily_record_audit WHERE at < now() - make_interval(days => keep) ORDER BY id LIMIT 20000
  )
  DELETE FROM public.daily_record_audit a USING old WHERE a.id = old.id;
  GET DIAGNOSTICS n_audit = ROW_COUNT;
  DELETE FROM public.daily_record_reviews WHERE at < now() - make_interval(days => keep);
  GET DIAGNOSTICS n_reviews = ROW_COUNT;
  DELETE FROM public.fee_reminders_sent WHERE sent_at < now() - make_interval(days => keep + 35);
  GET DIAGNOSTICS n_reminders = ROW_COUNT;
  RETURN jsonb_build_object('audit', n_audit, 'reviews', n_reviews, 'reminders', n_reminders);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_old_record_audit(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_record_audit(integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-audit-retention';
    PERFORM cron.schedule('zen-audit-retention', '41 3 * * *', 'SELECT public.purge_old_record_audit()');
  END IF;
END $$;

-- ─────────── 2. التعديلات بعد الإغلاق في تقرير الحلقة ───────────

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
                                                            'notes', r.notes,
                                                            'edits_after_close',
                                                              (SELECT count(DISTINCT a.txid)::int FROM public.daily_record_audit a
                                                                WHERE a.record_id = r.id AND a.action = 'edit'))
                                       ORDER BY r.record_date)
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
