-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي — المرحلة 4 من خطة التطوير: الموثوقية (docs/DAILY_RECORD.md، DR-13 وDR-26)
-- ════════════════════════════════════════════════════════════════════════════
-- DR-13: ورقة يوم سابق كانت تعرض أعضاء الحلقة الآن فقط: طالب نُقل بعد ذلك اليوم يختفي حضوره وإنجازه من
--   سجله، وطالب انضمّ لاحقاً يظهر «بلا حضور». الآن: الأعضاء الحاليون ومن له في ذلك اليوم أثر في الحلقة، مع
--   member = false لمن انتقل (الكتابة له مرفوضة أصلاً بـSTUDENT_NOT_IN_HALAQA).
-- DR-26: «غاب N في 30 يوماً» كانت تعدّ 31 يوماً (_date - 30 .. _date)؛ الآن 30 يوماً بالضبط.
-- إعادة تعريف فقط. التراجع: إعادة تعريف الدالتين من 20261117100000. الفحص: supabase/tests/checks.sql (137).

CREATE OR REPLACE FUNCTION private.daily_student_row(_halaqa uuid, _date date, _record uuid, _student uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'student_id', _student,
    'name', coalesce(p.name, ''),
    'avatar', p.avatar,
    'status', a.status,
    'reason', a.reason,
    'version', coalesce(e.version, 0),
    -- DR-13: false لطالب انتقل من الحلقة وله سطر في هذا اليوم (يُعرض للقراءة فقط).
    'member', EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa AND hs.student_id = _student),
    'note', e.note,
    'evaluation', CASE WHEN e.eval_overall IS NULL AND e.eval_tajweed IS NULL
                            AND e.eval_pronunciation IS NULL AND e.eval_behavior IS NULL THEN NULL
                       ELSE jsonb_build_object('overall', e.eval_overall, 'tajweed', e.eval_tajweed,
                                               'pronunciation', e.eval_pronunciation, 'behavior', e.eval_behavior) END,
    'memorize', CASE WHEN _record IS NULL THEN NULL ELSE private.daily_kind_json(_record, _student, 'memorize') END,
    'review', CASE WHEN _record IS NULL THEN NULL ELSE private.daily_kind_json(_record, _student, 'review') END,
    'last_memorize', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                                'to_ayah', s.to_ayah, 'session_date', s.session_date)
                        FROM public.recitation_sessions s
                       WHERE s.student_id = _student AND s.kind = 'memorize' AND s.status = 'approved'
                         AND s.session_date < _date
                       ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1),
    'last_review', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                              'to_ayah', s.to_ayah, 'session_date', s.session_date)
                      FROM public.recitation_sessions s
                     WHERE s.student_id = _student AND s.kind = 'review' AND s.status = 'approved'
                       AND s.session_date < _date
                     ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1),
    'absences_30d', (SELECT count(*) FROM public.attendance x
                      WHERE x.student_id = _student AND x.halaqa_id = _halaqa AND x.status = 'absent'
                        AND x.session_date BETWEEN _date - 29 AND _date)
  )
    FROM (SELECT 1) one
    LEFT JOIN public.profiles p ON p.id = _student
    LEFT JOIN public.attendance a ON a.student_id = _student AND a.halaqa_id = _halaqa AND a.session_date = _date
    LEFT JOIN public.halaqa_register_entries e
           ON e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = _student;
$$;

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
    'can_edit', editor AND _date BETWEEN public.zen_today() - 14 AND public.zen_today(),
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
