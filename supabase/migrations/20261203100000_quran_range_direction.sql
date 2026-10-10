-- ════════════════════════════════════════════════════════════════════════════
-- مدى الحفظ والمراجعة في الاتجاهين (خطة 1.14.0)
-- ════════════════════════════════════════════════════════════════════════════
-- كان المدى عبر السور يُقبل بترتيب المصحف فقط (من الفاتحة نحو الناس)، فلا يُسجَّل لطالب يحفظ من «الناس»
-- صعوداً (الناس ثم الفلق ثم الإخلاص...). الآن:
-- - المقطع داخل السورة يبقى من آية إلى آية بعدها، أما السور فبالترتيب الذي أرسله المعلّم (تصاعدياً أو تنازلياً).
-- - recitation_sessions.seg_index يحفظ ترتيب المقاطع؛ فيُقرأ المدى كما سُجّل، و«آخر حفظ» هو آخر مقطع فعلاً.
-- - halaqa_students.memorize_dir / review_dir: اتجاه كل طالب (forward | backward)، يُرسل مع الحفظ (direction)
--   ويُعاد في سطر الطالب لتقترح الواجهة بداية الغد في الاتجاه نفسه.
-- - حدّ المقاطع 60 سورة بدل 10 (مراجعة جزء عمّ كاملاً 37 سورة).
-- إضافات وإعادة تعريف فقط. التراجع: إعادة تعريف الدوال الأربع من ترحيلاتها السابقة
--   (20261117100000 و20261122100000 و20261124100000)، ثم
--   ALTER TABLE public.recitation_sessions DROP COLUMN seg_index;
--   ALTER TABLE public.halaqa_students DROP COLUMN memorize_dir, DROP COLUMN review_dir;
-- الفحص: supabase/tests/checks.sql (146).

ALTER TABLE public.recitation_sessions ADD COLUMN IF NOT EXISTS seg_index smallint;
COMMENT ON COLUMN public.recitation_sessions.seg_index IS
  'ترتيب المقطع ضمن مدى اليوم في السجل اليومي (1..60)؛ null للتسميعات القديمة (بترتيب المصحف).';
ALTER TABLE public.halaqa_students
  ADD COLUMN IF NOT EXISTS memorize_dir text NOT NULL DEFAULT 'forward',
  ADD COLUMN IF NOT EXISTS review_dir text NOT NULL DEFAULT 'forward';
DO $$ BEGIN
  ALTER TABLE public.halaqa_students ADD CONSTRAINT halaqa_students_memorize_dir_check
    CHECK (memorize_dir IN ('forward', 'backward'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.halaqa_students ADD CONSTRAINT halaqa_students_review_dir_check
    CHECK (review_dir IN ('forward', 'backward'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- من 20261117100000: المقاطع بترتيب تسجيلها.
CREATE OR REPLACE FUNCTION private.daily_kind_json(_record uuid, _student uuid, _kind text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
    'segments', jsonb_agg(jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah, 'to_ayah', s.to_ayah)
                          ORDER BY s.seg_index NULLS LAST, private.surah_no(s.surah_name), s.from_ayah),
    'score', (array_agg(ra.score ORDER BY s.seg_index NULLS LAST, private.surah_no(s.surah_name), s.from_ayah))[1],
    'error_type', (array_agg(ra.errors -> 0 ->> 'type' ORDER BY s.seg_index NULLS LAST, private.surah_no(s.surah_name), s.from_ayah))[1],
    'notes', (array_agg(ra.teacher_notes ORDER BY s.seg_index NULLS LAST, private.surah_no(s.surah_name), s.from_ayah))[1]
  ) END
    FROM public.recitation_sessions s
    LEFT JOIN public.recitation_assessments ra ON ra.session_id = s.id
   WHERE s.daily_record_id = _record AND s.student_id = _student AND s.kind = _kind;
$$;

-- من 20261124100000: الاتجاهان، و«آخر» مقطع بترتيبه.
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
                       ORDER BY s.session_date DESC, s.created_at DESC, s.seg_index DESC NULLS LAST,
                                private.surah_no(s.surah_name) DESC, s.to_ayah DESC LIMIT 1),
    'last_review', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                              'to_ayah', s.to_ayah, 'session_date', s.session_date)
                      FROM public.recitation_sessions s
                     WHERE s.student_id = _student AND s.kind = 'review' AND s.status = 'approved'
                       AND s.session_date < _date
                     ORDER BY s.session_date DESC, s.created_at DESC, s.seg_index DESC NULLS LAST,
                                private.surah_no(s.surah_name) DESC, s.to_ayah DESC LIMIT 1),
    -- 1.14.0: اتجاه الطالب في الحفظ والمراجعة (forward: من الفاتحة نحو الناس، backward: من الناس نحو الفاتحة).
    'memorize_dir', coalesce((SELECT hs.memorize_dir FROM public.halaqa_students hs
                               WHERE hs.halaqa_id = _halaqa AND hs.student_id = _student), 'forward'),
    'review_dir', coalesce((SELECT hs.review_dir FROM public.halaqa_students hs
                             WHERE hs.halaqa_id = _halaqa AND hs.student_id = _student), 'forward'),
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

-- من 20261122100000: الاتجاه، وترتيب المقاطع، وحدّ 60.
CREATE OR REPLACE FUNCTION public.save_daily_entry(_record uuid, _student uuid, _payload jsonb, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
  att public.attendance;
  k text;
  part jsonb;
  seg jsonb;
  grade integer;
  err_type text;
  notes text;
  sname text;
  a_from integer;
  a_to integer;
  sess_id uuid;
  first_sess uuid;
  first_ass uuid;
  ev jsonb;
  c text;
  dir text;
  idx integer;
BEGIN
  rec := private.daily_record_for_write(_record, false);
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  PERFORM private.daily_entry_check(rec.halaqa_id, rec.record_date, _student, _version);
  SELECT * INTO att FROM public.attendance a
   WHERE a.student_id = _student AND a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date;

  FOREACH k IN ARRAY ARRAY['memorize', 'review'] LOOP
    CONTINUE WHEN NOT _payload ? k;
    part := _payload -> k;
    IF jsonb_typeof(part) = 'null' THEN
      PERFORM private.daily_undo_card(s.id) FROM public.recitation_sessions s
       WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k;
      DELETE FROM public.recitation_sessions s
       WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k;
      CONTINUE;
    END IF;
    IF jsonb_typeof(part) <> 'object' OR jsonb_typeof(part -> 'segments') IS DISTINCT FROM 'array'
       OR jsonb_array_length(part -> 'segments') NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'INVALID_RANGE';
    END IF;
    IF att.status IN ('absent', 'excused') THEN RAISE EXCEPTION 'STUDENT_NOT_PRESENT'; END IF;
    grade := (part ->> 'grade')::integer;
    IF grade IS NULL OR grade NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_GRADE'; END IF;
    err_type := coalesce(nullif(part ->> 'error_type', ''), 'none');
    IF err_type NOT IN ('none', 'hifz', 'tajweed', 'tashkeel', 'waqf') THEN RAISE EXCEPTION 'INVALID_ERROR_TYPE'; END IF;
    notes := nullif(trim(part ->> 'notes'), '');
    IF notes IS NOT NULL AND char_length(notes) > 1000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;
    dir := nullif(part ->> 'direction', '');
    IF dir IS NOT NULL AND dir NOT IN ('forward', 'backward') THEN RAISE EXCEPTION 'INVALID_DIRECTION'; END IF;
    FOR seg IN SELECT * FROM jsonb_array_elements(part -> 'segments') LOOP
      sname := seg ->> 'surah_name';
      a_from := (seg ->> 'from_ayah')::integer;
      a_to := (seg ->> 'to_ayah')::integer;
      IF private.surah_no(sname) IS NULL OR a_from IS NULL OR a_to IS NULL
         OR a_from < 1 OR a_to < a_from OR a_to > private.surah_ayahs(sname) THEN
        RAISE EXCEPTION 'INVALID_RANGE';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT e ->> 'surah_name') FROM jsonb_array_elements(part -> 'segments') e)
       <> jsonb_array_length(part -> 'segments') THEN
      RAISE EXCEPTION 'INVALID_RANGE';
    END IF;

    -- حاضر ضمناً إن سُجّل إنجاز ولم يُسجَّل الحضور بعد.
    IF att.id IS NULL THEN
      INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
      VALUES (_student, rec.halaqa_id, caller, rec.record_date, 'present')
      RETURNING * INTO att;
    END IF;

    PERFORM private.daily_undo_card(s.id) FROM public.recitation_sessions s
     WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(part -> 'segments') e
                        WHERE e ->> 'surah_name' = s.surah_name
                          AND (e ->> 'from_ayah')::integer = s.from_ayah
                          AND (e ->> 'to_ayah')::integer = s.to_ayah);
    DELETE FROM public.recitation_sessions s
     WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(part -> 'segments') e
                        WHERE e ->> 'surah_name' = s.surah_name
                          AND (e ->> 'from_ayah')::integer = s.from_ayah
                          AND (e ->> 'to_ayah')::integer = s.to_ayah);
    -- الاتجاه المختار يُحفظ للطالب في حلقته (يقترح بداية الغد في الاتجاه نفسه).
    IF dir IS NOT NULL THEN
      IF k = 'memorize' THEN
        UPDATE public.halaqa_students SET memorize_dir = dir WHERE halaqa_id = rec.halaqa_id AND student_id = _student;
      ELSE
        UPDATE public.halaqa_students SET review_dir = dir WHERE halaqa_id = rec.halaqa_id AND student_id = _student;
      END IF;
    END IF;
    FOR seg, idx IN SELECT e.value, e.ordinality FROM jsonb_array_elements(part -> 'segments') WITH ORDINALITY e LOOP
      sname := seg ->> 'surah_name';
      a_from := (seg ->> 'from_ayah')::integer;
      a_to := (seg ->> 'to_ayah')::integer;
      SELECT s.id INTO sess_id FROM public.recitation_sessions s
       WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k
         AND s.surah_name = sname AND s.from_ayah = a_from AND s.to_ayah = a_to;
      IF sess_id IS NULL THEN
        INSERT INTO public.recitation_sessions
          (student_id, halaqa_id, surah_name, from_ayah, to_ayah, kind, status, session_date, daily_record_id, seg_index)
        VALUES (_student, rec.halaqa_id, sname, a_from, a_to, k, 'approved', rec.record_date, rec.id, idx)
        RETURNING id INTO sess_id;
        INSERT INTO public.recitation_assessments
          (session_id, student_id, teacher_id, score, errors, teacher_notes, approved)
        VALUES (sess_id, _student, caller, public.grade_to_score(grade),
                CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
                notes, true);
        PERFORM private.daily_apply_review(sess_id, _student, sname, a_from, a_to, public.grade_to_score(grade));
      ELSE
        UPDATE public.recitation_sessions SET seg_index = idx WHERE id = sess_id AND seg_index IS DISTINCT FROM idx;
        UPDATE public.recitation_assessments
           SET score = public.grade_to_score(grade),
               errors = CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
               teacher_notes = notes, updated_at = now()
         WHERE session_id = sess_id;
      END IF;
    END LOOP;
  END LOOP;

  IF _payload ? 'evaluation' THEN
    ev := CASE WHEN jsonb_typeof(_payload -> 'evaluation') = 'object' THEN _payload -> 'evaluation' ELSE '{}'::jsonb END;
    FOREACH c IN ARRAY ARRAY['overall', 'tajweed', 'pronunciation', 'behavior'] LOOP
      IF ev ? c AND jsonb_typeof(ev -> c) <> 'null'
         AND (jsonb_typeof(ev -> c) <> 'number' OR (ev ->> c)::numeric NOT IN (1, 2, 3, 4, 5)) THEN
        RAISE EXCEPTION 'INVALID_EVALUATION';
      END IF;
    END LOOP;
  END IF;
  IF _payload ? 'note' AND jsonb_typeof(_payload -> 'note') NOT IN ('null', 'string') THEN
    RAISE EXCEPTION 'INVALID_NOTES';
  END IF;
  IF _payload ? 'note' AND char_length(coalesce(_payload ->> 'note', '')) > 1000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;

  SELECT s.id, ra.id INTO first_sess, first_ass
    FROM public.recitation_sessions s
    LEFT JOIN public.recitation_assessments ra ON ra.session_id = s.id
   WHERE s.daily_record_id = rec.id AND s.student_id = _student
   ORDER BY (s.kind = 'memorize') DESC, s.seg_index NULLS LAST, private.surah_no(s.surah_name), s.from_ayah LIMIT 1;

  INSERT INTO public.halaqa_register_entries AS e
    (halaqa_id, session_date, student_id, attendance_id, recitation_session_id, assessment_id, recorded_by,
     note, eval_overall, eval_tajweed, eval_pronunciation, eval_behavior)
  VALUES (rec.halaqa_id, rec.record_date, _student, att.id, first_sess, first_ass, caller,
          nullif(trim(_payload ->> 'note'), ''),
          (ev ->> 'overall')::smallint, (ev ->> 'tajweed')::smallint,
          (ev ->> 'pronunciation')::smallint, (ev ->> 'behavior')::smallint)
  ON CONFLICT (halaqa_id, session_date, student_id) DO UPDATE SET
    attendance_id = coalesce(att.id, e.attendance_id),
    recitation_session_id = first_sess,
    assessment_id = first_ass,
    recorded_by = caller,
    note = CASE WHEN _payload ? 'note' THEN nullif(trim(_payload ->> 'note'), '') ELSE e.note END,
    eval_overall = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'overall')::smallint ELSE e.eval_overall END,
    eval_tajweed = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'tajweed')::smallint ELSE e.eval_tajweed END,
    eval_pronunciation = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'pronunciation')::smallint ELSE e.eval_pronunciation END,
    eval_behavior = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'behavior')::smallint ELSE e.eval_behavior END,
    version = e.version + 1,
    updated_at = now();

  RETURN private.daily_student_row(rec.halaqa_id, rec.record_date, rec.id, _student);
END;
$$;

-- من 20261117100000: «آخر» مقطع بترتيبه.
CREATE OR REPLACE FUNCTION public.student_daily_overview(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller <> _student AND NOT private.teaches_student(caller, _student) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'attendance', (SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE a.status = 'present'),
        'late', count(*) FILTER (WHERE a.status = 'late'),
        'absent', count(*) FILTER (WHERE a.status = 'absent'),
        'excused', count(*) FILTER (WHERE a.status = 'excused'))
      FROM public.attendance a
     WHERE a.student_id = _student AND a.session_date BETWEEN public.zen_today() - 30 AND public.zen_today()),
    'last_memorize', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                                'to_ayah', s.to_ayah, 'session_date', s.session_date)
                        FROM public.recitation_sessions s
                       WHERE s.student_id = _student AND s.kind = 'memorize' AND s.status = 'approved'
                       ORDER BY s.session_date DESC, s.created_at DESC, s.seg_index DESC NULLS LAST,
                                private.surah_no(s.surah_name) DESC, s.to_ayah DESC LIMIT 1),
    'last_review', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                              'to_ayah', s.to_ayah, 'session_date', s.session_date)
                      FROM public.recitation_sessions s
                     WHERE s.student_id = _student AND s.kind = 'review' AND s.status = 'approved'
                     ORDER BY s.session_date DESC, s.created_at DESC, s.seg_index DESC NULLS LAST,
                                private.surah_no(s.surah_name) DESC, s.to_ayah DESC LIMIT 1),
    'last_evaluation', (SELECT jsonb_build_object('session_date', e.session_date, 'overall', e.eval_overall,
                                                  'tajweed', e.eval_tajweed, 'pronunciation', e.eval_pronunciation,
                                                  'behavior', e.eval_behavior)
                          FROM public.halaqa_register_entries e
                         WHERE e.student_id = _student
                           AND (e.eval_overall IS NOT NULL OR e.eval_tajweed IS NOT NULL
                                OR e.eval_pronunciation IS NOT NULL OR e.eval_behavior IS NOT NULL)
                         ORDER BY e.session_date DESC LIMIT 1),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('session_date', n.session_date, 'note', n.note)
                                        ORDER BY n.session_date DESC)
                         FROM (SELECT e.session_date, e.note FROM public.halaqa_register_entries e
                                WHERE e.student_id = _student AND e.note IS NOT NULL
                                ORDER BY e.session_date DESC LIMIT 5) n), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.daily_kind_json(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.daily_student_row(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_daily_entry(uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_daily_entry(uuid, uuid, jsonb, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.student_daily_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_daily_overview(uuid) TO authenticated, service_role;
