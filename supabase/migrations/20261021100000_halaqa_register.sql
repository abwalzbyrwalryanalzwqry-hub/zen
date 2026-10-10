-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.1 — سجل الحلقة السريع
-- ════════════════════════════════════════════════════════════════════════════
-- شاشة واحدة للمعلّم: حضور + تسميع + تقييم لكل طالب في الحلقة، تُحفظ في معاملة واحدة.
--   record_halaqa_session(_halaqa, _date, _rows)  يكتب الحضور وجلسة التسميع والتقييم،
--     ويجدول المراجعة عبر apply_review (القاعدة 4) عند أول حفظ للمقطع فقط.
--   halaqa_register_sheet(_halaqa, _date)          طلاب الحلقة وقيد اليوم إن وُجد، ومقترح
--     «من» التالي من آخر تسميع.
-- مفتاح عدم التكرار: (الحلقة، التاريخ، الطالب) في halaqa_register_entries؛ إعادة الإرسال
-- (من صندوق الإرسال بلا اتصال مثلاً) تحدّث القيد نفسه ولا تنشئ صفاً جديداً.

CREATE TABLE IF NOT EXISTS public.halaqa_register_entries (
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id uuid REFERENCES public.attendance(id) ON DELETE SET NULL,
  recitation_session_id uuid REFERENCES public.recitation_sessions(id) ON DELETE SET NULL,
  assessment_id uuid REFERENCES public.recitation_assessments(id) ON DELETE SET NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (halaqa_id, session_date, student_id)
);
ALTER TABLE public.halaqa_register_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_register_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.halaqa_register_entries TO authenticated;
GRANT ALL ON public.halaqa_register_entries TO service_role;
DROP POLICY IF EXISTS "register read manager" ON public.halaqa_register_entries;
CREATE POLICY "register read manager" ON public.halaqa_register_entries FOR SELECT TO authenticated
  USING (private.manages_halaqa((SELECT auth.uid()), halaqa_id));
CREATE INDEX IF NOT EXISTS halaqa_register_entries_student_idx
  ON public.halaqa_register_entries (student_id, session_date DESC);

/** درجة 1..5 إلى درجة 0..100 تطابق عتبات sm2_quality. */
CREATE OR REPLACE FUNCTION public.grade_to_score(_grade integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE _grade WHEN 1 THEN 35 WHEN 2 THEN 55 WHEN 3 THEN 70 WHEN 4 THEN 85 WHEN 5 THEN 95 END;
$$;
REVOKE ALL ON FUNCTION public.grade_to_score(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_to_score(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.record_halaqa_session(_halaqa uuid, _date date, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r jsonb;
  sid uuid;
  st text;
  grade integer;
  surah text;
  a_from integer;
  a_to integer;
  v_kind text;
  err_type text;
  entry public.halaqa_register_entries;
  att_id uuid;
  sess_id uuid;
  ass_id uuid;
  created integer := 0;
  updated integer := 0;
  reviews integer := 0;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF _date IS NULL OR _date > public.zen_today() OR _date < public.zen_today() - 14 THEN
    RAISE EXCEPTION 'INVALID_DATE';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 OR jsonb_array_length(_rows) > 80 THEN
    RAISE EXCEPTION 'INVALID_ROWS';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    sid := (r ->> 'student_id')::uuid;
    st := coalesce(r ->> 'status', 'present');
    IF st NOT IN ('present', 'absent', 'late', 'excused') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa AND hs.student_id = sid) THEN
      RAISE EXCEPTION 'STUDENT_NOT_IN_HALAQA';
    END IF;

    SELECT * INTO entry FROM public.halaqa_register_entries e
     WHERE e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = sid
     FOR UPDATE;

    -- الحضور: صف واحد لكل (طالب، حلقة، يوم).
    INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status, reason)
    VALUES (sid, _halaqa, caller, _date, st, nullif(r ->> 'reason', ''))
    ON CONFLICT (student_id, (COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid)), session_date)
    DO UPDATE
      SET status = EXCLUDED.status, reason = EXCLUDED.reason, teacher_id = caller, updated_at = now()
    RETURNING id INTO att_id;

    sess_id := entry.recitation_session_id;
    ass_id := entry.assessment_id;
    surah := nullif(trim(r ->> 'surah_name'), '');
    grade := (r ->> 'grade')::integer;
    IF st IN ('present', 'late') AND surah IS NOT NULL THEN
      a_from := (r ->> 'from_ayah')::integer;
      a_to := coalesce((r ->> 'to_ayah')::integer, a_from);
      v_kind := coalesce(nullif(r ->> 'kind', ''), 'memorize');
      err_type := coalesce(nullif(r ->> 'error_type', ''), 'none');
      IF a_from IS NULL OR a_from < 1 OR a_to < a_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
      IF v_kind NOT IN ('memorize', 'review') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
      IF grade IS NULL OR grade NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_GRADE'; END IF;
      IF err_type NOT IN ('none', 'hifz', 'tajweed', 'tashkeel', 'waqf') THEN RAISE EXCEPTION 'INVALID_ERROR_TYPE'; END IF;

      IF sess_id IS NULL THEN
        INSERT INTO public.recitation_sessions
          (student_id, halaqa_id, surah_name, from_ayah, to_ayah, kind, status, session_date)
        VALUES (sid, _halaqa, surah, a_from, a_to, v_kind, 'approved', _date)
        RETURNING id INTO sess_id;
        INSERT INTO public.recitation_assessments
          (session_id, student_id, teacher_id, score, errors, teacher_notes, approved)
        VALUES (sess_id, sid, caller, public.grade_to_score(grade),
                CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
                nullif(r ->> 'notes', ''), true)
        RETURNING id INTO ass_id;
        -- الجدولة عبر apply_review وحدها، مرة واحدة لكل قيد.
        PERFORM public.apply_review(sid, surah, a_from, a_to, public.grade_to_score(grade));
        reviews := reviews + 1;
      ELSE
        -- تصحيح قيد قائم: يُحدَّث السجل ولا تُعاد الجدولة (لا مضاعفة لأثر SM-2).
        UPDATE public.recitation_sessions
           SET surah_name = surah, from_ayah = a_from, to_ayah = a_to, kind = v_kind, updated_at = now()
         WHERE id = sess_id;
        UPDATE public.recitation_assessments
           SET score = public.grade_to_score(grade),
               errors = CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
               teacher_notes = nullif(r ->> 'notes', ''), updated_at = now()
         WHERE id = ass_id;
      END IF;
    END IF;

    IF entry.student_id IS NULL THEN
      INSERT INTO public.halaqa_register_entries
        (halaqa_id, session_date, student_id, attendance_id, recitation_session_id, assessment_id, recorded_by)
      VALUES (_halaqa, _date, sid, att_id, sess_id, ass_id, caller);
      created := created + 1;
    ELSE
      UPDATE public.halaqa_register_entries
         SET attendance_id = att_id, recitation_session_id = sess_id, assessment_id = ass_id,
             recorded_by = caller, updated_at = now()
       WHERE halaqa_id = _halaqa AND session_date = _date AND student_id = sid;
      updated := updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', created, 'updated', updated, 'reviews', reviews);
END;
$$;
REVOKE ALL ON FUNCTION public.record_halaqa_session(uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_halaqa_session(uuid, date, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.halaqa_register_sheet(_halaqa uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.manages_halaqa((SELECT auth.uid()), _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row ORDER BY row ->> 'name')
      FROM (
        SELECT jsonb_build_object(
          'student_id', hs.student_id,
          'name', coalesce(p.name, 'طالب'),
          'status', a.status,
          'entry', (SELECT jsonb_build_object(
                      'surah_name', s.surah_name, 'from_ayah', s.from_ayah, 'to_ayah', s.to_ayah,
                      'kind', s.kind, 'score', ra.score, 'errors', ra.errors, 'notes', ra.teacher_notes)
                      FROM public.halaqa_register_entries e
                      JOIN public.recitation_sessions s ON s.id = e.recitation_session_id
                      LEFT JOIN public.recitation_assessments ra ON ra.id = e.assessment_id
                     WHERE e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = hs.student_id),
          'last', (SELECT jsonb_build_object('surah_name', s.surah_name, 'to_ayah', s.to_ayah,
                                             'kind', s.kind, 'session_date', s.session_date)
                     FROM public.recitation_sessions s
                    WHERE s.student_id = hs.student_id AND s.session_date < _date
                      AND s.status = 'approved' AND s.kind = 'memorize'
                    ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1)
        ) AS row
          FROM public.halaqa_students hs
          LEFT JOIN public.profiles p ON p.id = hs.student_id
          LEFT JOIN public.attendance a
                 ON a.student_id = hs.student_id AND a.halaqa_id = _halaqa AND a.session_date = _date
         WHERE hs.halaqa_id = _halaqa
      ) t
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.halaqa_register_sheet(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.halaqa_register_sheet(uuid, date) TO authenticated, service_role;
