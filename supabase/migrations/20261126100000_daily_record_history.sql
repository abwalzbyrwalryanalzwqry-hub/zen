-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي — قائمة أيام السجل وحذف سجل يوم (docs/DAILY_RECORD.md، DR-30 وDR-31)
-- ════════════════════════════════════════════════════════════════════════════
-- daily_record_history: سجلات الحلقة يوماً يوماً، الأحدث أولاً، مع ملخص كل يوم (الحضور والحفظ
--   والمراجعة) وهل يقبل التعديل (مدير الحلقة، غير مُغلق، داخل نافذة 14 يوماً). القراءة لمدير الحلقة
--   ولطاقم المركز كما في daily_record_week.
-- delete_daily_record: يحذف سجل يوم كاملاً بقفل متفائل: تُعاد بطاقات المراجعة كما كانت قبل تسميعات
--   ذلك اليوم (private.daily_undo_card)، ثم تُحذف التسميعات وأسطر الطلاب والحضور والسجل نفسه.
--   مدير الحلقة فقط، والسجل غير مُغلق نهائياً، وداخل نافذة التعديل.
-- التراجع: DROP FUNCTION public.daily_record_history(uuid, date, integer), public.delete_daily_record(uuid, integer);
-- الفحص: supabase/tests/checks.sql (139).

CREATE OR REPLACE FUNCTION public.daily_record_history(_halaqa uuid, _before date DEFAULT NULL, _limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
  manager boolean;
  lim integer := least(greatest(coalesce(_limit, 30), 1), 60);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  manager := private.manages_halaqa(caller, _halaqa);
  IF NOT manager AND NOT private.can_view_center(caller, h.center_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x.j ORDER BY x.record_date DESC)
      FROM (
        SELECT r.record_date, jsonb_build_object(
          'id', r.id,
          'date', r.record_date,
          'status', r.status,
          'version', r.version,
          'notes', r.notes,
          'completed_at', r.completed_at,
          'updated_at', r.updated_at,
          'present', (SELECT count(*) FROM public.attendance a
                       WHERE a.halaqa_id = r.halaqa_id AND a.session_date = r.record_date AND a.status = 'present'),
          'late', (SELECT count(*) FROM public.attendance a
                    WHERE a.halaqa_id = r.halaqa_id AND a.session_date = r.record_date AND a.status = 'late'),
          'absent', (SELECT count(*) FROM public.attendance a
                      WHERE a.halaqa_id = r.halaqa_id AND a.session_date = r.record_date AND a.status = 'absent'),
          'excused', (SELECT count(*) FROM public.attendance a
                       WHERE a.halaqa_id = r.halaqa_id AND a.session_date = r.record_date AND a.status = 'excused'),
          'memorized', (SELECT count(DISTINCT s.student_id) FROM public.recitation_sessions s
                         WHERE s.daily_record_id = r.id AND s.kind = 'memorize'),
          'reviewed', (SELECT count(DISTINCT s.student_id) FROM public.recitation_sessions s
                        WHERE s.daily_record_id = r.id AND s.kind = 'review'),
          'editable', manager AND r.status <> 'locked' AND r.record_date >= public.zen_today() - 14
                      AND r.record_date <= public.zen_today()
        ) AS j
          FROM public.halaqa_daily_records r
         WHERE r.halaqa_id = _halaqa AND (_before IS NULL OR r.record_date < _before)
         ORDER BY r.record_date DESC
         LIMIT lim
      ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.daily_record_history(uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_history(uuid, date, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_daily_record(_record uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
BEGIN
  -- الجلسة ومدير الحلقة وغير المُغلق، بقفل حصري (المكتمل يُحذف أيضاً).
  rec := private.daily_record_for_write(_record, true);
  IF _version IS NULL OR rec.version <> _version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF rec.record_date < public.zen_today() - 14 OR rec.record_date > public.zen_today() THEN
    RAISE EXCEPTION 'INVALID_DATE';
  END IF;

  PERFORM private.daily_undo_card(s.id) FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id;
  DELETE FROM public.halaqa_register_entries e
   WHERE e.halaqa_id = rec.halaqa_id AND e.session_date = rec.record_date;
  DELETE FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id;
  DELETE FROM public.attendance a WHERE a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date;
  DELETE FROM public.halaqa_daily_records WHERE id = rec.id;
  RETURN jsonb_build_object('id', rec.id, 'date', rec.record_date, 'deleted', true);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_daily_record(uuid, integer) TO authenticated, service_role;
