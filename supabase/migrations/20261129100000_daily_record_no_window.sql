-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي بلا نافذة زمنية للتعديل
-- ════════════════════════════════════════════════════════════════════════════
-- كانت أيام السجل تُفتح وتُعدَّل وتُحذف لليوم وآخر 14 يوماً فقط. صارت كل الأيام السابقة متاحة لمدير
-- الحلقة (القائمة، والتنقّل، والفتح، وإعادة فتح المكتمل، والحذف)، ويبقى الحدّان: لا يوم في المستقبل،
-- والسجل المُغلق نهائياً (locked) للقراءة فقط.
-- إعادة تعريف بالنص نفسه مع حذف شرط «zen_today() - 14» فقط.
-- التراجع: إعادة تعريف الدوال الخمس من ترحيلاتها السابقة (20261124100000 و20261117100000 و20261126100000).
-- الفحص: supabase/tests/checks.sql (142).

-- من 20261124100000_daily_record_reliability.sql
CREATE OR REPLACE FUNCTION public.daily_record_sheet(_halaqa uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
  rec public.halaqa_daily_records;
  editor boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  editor := private.manages_halaqa(caller, _halaqa);
  IF NOT editor AND NOT private.can_view_center(caller, h.center_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE halaqa_id = _halaqa AND record_date = _date;
  RETURN jsonb_build_object(
    'halaqa', jsonb_build_object('id', h.id, 'name', h.name,
                                 'teacher_name', (SELECT p.name FROM public.profiles p WHERE p.id = h.teacher_id)),
    'date', _date,
    'today', public.zen_today(),
    'can_edit', editor AND _date <= public.zen_today(),
    'can_lock', private.owns_center(caller, h.center_id),
    'record', CASE WHEN rec.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', rec.id, 'status', rec.status, 'version', rec.version, 'notes', rec.notes,
      'completed_at', rec.completed_at, 'locked_at', rec.locked_at,
      'completed_by_name', (SELECT p.name FROM public.profiles p WHERE p.id = rec.completed_by)) END,
    -- الأعضاء الحاليون، ومن له في هذا اليوم حضور أو سطر أو تسميع في السجل وإن انتقل بعدها (DR-13):
    -- تاريخ الحلقة لا يختفي بنقل طالب.
    'students', coalesce((
      SELECT jsonb_agg(private.daily_student_row(_halaqa, _date, rec.id, x.student_id)
                       ORDER BY coalesce(p.name, ''), x.student_id)
        FROM (
          SELECT hs.student_id FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa
          UNION
          SELECT e.student_id FROM public.halaqa_register_entries e
           WHERE e.halaqa_id = _halaqa AND e.session_date = _date
          UNION
          SELECT a.student_id FROM public.attendance a
           WHERE a.halaqa_id = _halaqa AND a.session_date = _date
          UNION
          SELECT s.student_id FROM public.recitation_sessions s
           WHERE rec.id IS NOT NULL AND s.daily_record_id = rec.id
        ) x
        LEFT JOIN public.profiles p ON p.id = x.student_id), '[]'::jsonb)
  );
END;
$$;

-- من 20261117100000_halaqa_daily_records.sql
CREATE OR REPLACE FUNCTION public.open_daily_record(_halaqa uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF _date IS NULL OR _date > public.zen_today() THEN
    RAISE EXCEPTION 'INVALID_DATE';
  END IF;
  INSERT INTO public.halaqa_daily_records (halaqa_id, record_date, opened_by)
  VALUES (_halaqa, _date, caller)
  ON CONFLICT (halaqa_id, record_date) DO NOTHING;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE halaqa_id = _halaqa AND record_date = _date;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version);
END;
$$;

-- من 20261117100000_halaqa_daily_records.sql
CREATE OR REPLACE FUNCTION public.reopen_daily_record(_record uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
BEGIN
  rec := private.daily_record_for_write(_record, true);
  IF rec.status <> 'completed' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  IF rec.version <> coalesce(_version, -1) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF rec.record_date > public.zen_today() THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  UPDATE public.halaqa_daily_records
     SET status = 'open', completed_by = NULL, completed_at = NULL, version = version + 1
   WHERE id = rec.id
  RETURNING * INTO rec;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version);
END;
$$;

-- من 20261126100000_daily_record_history.sql
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
          'editable', manager AND r.status <> 'locked' AND r.record_date <= public.zen_today()
        ) AS j
          FROM public.halaqa_daily_records r
         WHERE r.halaqa_id = _halaqa AND (_before IS NULL OR r.record_date < _before)
         ORDER BY r.record_date DESC
         LIMIT lim
      ) x
  ), '[]'::jsonb);
END;
$$;

-- من 20261126100000_daily_record_history.sql
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
  IF rec.record_date > public.zen_today() THEN
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

REVOKE ALL ON FUNCTION public.daily_record_sheet(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_sheet(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.open_daily_record(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_daily_record(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reopen_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_daily_record(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.daily_record_history(uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_history(uuid, date, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_daily_record(uuid, integer) TO authenticated, service_role;
