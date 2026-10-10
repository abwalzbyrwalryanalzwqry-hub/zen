-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي — المرحلة 0 من خطة التطوير: سلامة البيانات (docs/DAILY_RECORD.md، DR-01 وDR-02)
-- ════════════════════════════════════════════════════════════════════════════
-- DR-01: تصحيح مدى حفظ أو مراجعة (أو حذفه) كان يحذف التسميع ويُبقي بطاقة SM-2 التي أنشأها في review_cards،
--   فتظهر للطالب مراجعة لمقطع لم يسمّعه. الآن تُلتقط البطاقة قبل apply_review، وعند حذف التسميع تُعاد كما
--   كانت (أو تُحذف إن أنشأها هذا التسميع)، بشرط ألا تكون تغيّرت بعد اللقطة (مراجعة لاحقة صحيحة لا تُمسّ).
-- DR-02: لمسة حضور (السبب null) كانت تمسح سبب الغياب أو الاستئذان المسجَّل. الآن: null يُبقي سبب الحالة نفسها،
--   و«حاضر» يمسحه، والنص الفارغ يمسحه صراحة.
-- إضافات فقط. التراجع: إعادة تعريف save_daily_entry وset_daily_attendance من 20261117100000، ثم
--   DROP FUNCTION private.daily_apply_review, private.daily_undo_card; DROP TABLE private.daily_card_snapshots.
-- الفحص: supabase/tests/checks.sql (135).

CREATE TABLE IF NOT EXISTS private.daily_card_snapshots (
  session_id uuid PRIMARY KEY REFERENCES public.recitation_sessions(id) ON DELETE CASCADE,
  card_id uuid NOT NULL,
  -- البطاقة قبل apply_review (null = لم تكن موجودة).
  card_before jsonb,
  -- updated_at بعد apply_review مباشرة: إن اختلف عند الحذف فالبطاقة رُوجعت بعدها ولا تُستعاد.
  after_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.daily_card_snapshots FROM PUBLIC, anon, authenticated;

/** apply_review مع لقطة البطاقة قبلها (للتسميعات التي ينشئها السجل اليومي وحده). */
CREATE OR REPLACE FUNCTION private.daily_apply_review(
  _session uuid, _student uuid, _surah text, _from integer, _to integer, _score integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before jsonb;
  card public.review_cards;
BEGIN
  SELECT to_jsonb(c) INTO before FROM public.review_cards c
   WHERE c.student_id = _student AND c.surah_name = _surah AND c.from_ayah = _from AND c.to_ayah = _to;
  PERFORM public.apply_review(_student, _surah, _from, _to, _score);
  SELECT * INTO card FROM public.review_cards c
   WHERE c.student_id = _student AND c.surah_name = _surah AND c.from_ayah = _from AND c.to_ayah = _to;
  IF card.id IS NOT NULL THEN
    INSERT INTO private.daily_card_snapshots (session_id, card_id, card_before, after_at)
    VALUES (_session, card.id, before, card.updated_at)
    ON CONFLICT (session_id) DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_apply_review(uuid, uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;

/** يعيد بطاقة التسميع المحذوف إلى ما كانت عليه قبله، إن لم تتغيّر بعده. */
CREATE OR REPLACE FUNCTION private.daily_undo_card(_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap private.daily_card_snapshots;
  b public.review_cards;
BEGIN
  SELECT * INTO snap FROM private.daily_card_snapshots WHERE session_id = _session;
  IF snap.session_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.review_cards c WHERE c.id = snap.card_id AND c.updated_at = snap.after_at) THEN
    RETURN;
  END IF;
  IF snap.card_before IS NULL THEN
    DELETE FROM public.review_cards WHERE id = snap.card_id;
  ELSE
    b := jsonb_populate_record(NULL::public.review_cards, snap.card_before);
    UPDATE public.review_cards
       SET ease = b.ease, interval_days = b.interval_days, repetitions = b.repetitions, lapses = b.lapses,
           last_score = b.last_score, last_reviewed_at = b.last_reviewed_at, due_date = b.due_date
     WHERE id = snap.card_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_undo_card(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────── set_daily_attendance: السبب لا يُمسح بلمسة الحالة نفسها (DR-02) ───────────

CREATE OR REPLACE FUNCTION public.set_daily_attendance(
  _record uuid, _student uuid, _status text, _reason text, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
  att_id uuid;
BEGIN
  rec := private.daily_record_for_write(_record, false);
  IF _status NOT IN ('present', 'absent', 'late', 'excused') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF _reason IS NOT NULL AND char_length(_reason) > 300 THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
  PERFORM private.daily_entry_check(rec.halaqa_id, rec.record_date, _student, _version);
  IF _status IN ('absent', 'excused') AND EXISTS (
    SELECT 1 FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id AND s.student_id = _student) THEN
    RAISE EXCEPTION 'HAS_ACHIEVEMENT';
  END IF;

  INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status, reason)
  VALUES (_student, rec.halaqa_id, caller, rec.record_date, _status, nullif(trim(_reason), ''))
  ON CONFLICT (student_id, (COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid)), session_date)
  DO UPDATE SET status = EXCLUDED.status,
    -- السبب: «حاضر» يمسحه؛ null مع الحالة نفسها يُبقيه (لمسة حضور لا تمسح سبباً سُجّل)؛ '' يمسحه صراحة.
    reason = CASE WHEN EXCLUDED.status = 'present' THEN NULL
                  WHEN _reason IS NULL AND attendance.status = EXCLUDED.status THEN attendance.reason
                  ELSE EXCLUDED.reason END,
    teacher_id = caller, updated_at = now()
  RETURNING id INTO att_id;

  INSERT INTO public.halaqa_register_entries (halaqa_id, session_date, student_id, attendance_id, recorded_by)
  VALUES (rec.halaqa_id, rec.record_date, _student, att_id, caller)
  ON CONFLICT (halaqa_id, session_date, student_id) DO UPDATE
    SET attendance_id = att_id, recorded_by = caller, version = halaqa_register_entries.version + 1, updated_at = now();

  RETURN private.daily_student_row(rec.halaqa_id, rec.record_date, rec.id, _student);
END;
$$;

-- ─────────── save_daily_entry: لقطة قبل الجدولة، واستعادة عند الحذف (DR-01) ───────────

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
       OR jsonb_array_length(part -> 'segments') NOT BETWEEN 1 AND 10 THEN
      RAISE EXCEPTION 'INVALID_RANGE';
    END IF;
    IF att.status IN ('absent', 'excused') THEN RAISE EXCEPTION 'STUDENT_NOT_PRESENT'; END IF;
    grade := (part ->> 'grade')::integer;
    IF grade IS NULL OR grade NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_GRADE'; END IF;
    err_type := coalesce(nullif(part ->> 'error_type', ''), 'none');
    IF err_type NOT IN ('none', 'hifz', 'tajweed', 'tashkeel', 'waqf') THEN RAISE EXCEPTION 'INVALID_ERROR_TYPE'; END IF;
    notes := nullif(trim(part ->> 'notes'), '');
    IF notes IS NOT NULL AND char_length(notes) > 1000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;
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
    FOR seg IN SELECT * FROM jsonb_array_elements(part -> 'segments') LOOP
      sname := seg ->> 'surah_name';
      a_from := (seg ->> 'from_ayah')::integer;
      a_to := (seg ->> 'to_ayah')::integer;
      SELECT s.id INTO sess_id FROM public.recitation_sessions s
       WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k
         AND s.surah_name = sname AND s.from_ayah = a_from AND s.to_ayah = a_to;
      IF sess_id IS NULL THEN
        INSERT INTO public.recitation_sessions
          (student_id, halaqa_id, surah_name, from_ayah, to_ayah, kind, status, session_date, daily_record_id)
        VALUES (_student, rec.halaqa_id, sname, a_from, a_to, k, 'approved', rec.record_date, rec.id)
        RETURNING id INTO sess_id;
        INSERT INTO public.recitation_assessments
          (session_id, student_id, teacher_id, score, errors, teacher_notes, approved)
        VALUES (sess_id, _student, caller, public.grade_to_score(grade),
                CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
                notes, true);
        PERFORM private.daily_apply_review(sess_id, _student, sname, a_from, a_to, public.grade_to_score(grade));
      ELSE
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
   ORDER BY (s.kind = 'memorize') DESC, private.surah_no(s.surah_name), s.from_ayah LIMIT 1;

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
