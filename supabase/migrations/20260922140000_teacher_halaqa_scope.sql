-- ════════════════════════════════════════════════════════════════════
-- تقييد المعلّم على طلاب حلقاته: التسميعات والتقدّم والحضور
--
-- قبل هذا الترحيل: كل سياسة تكتفي بـ is_teacher(auth.uid())، فأي صاحب دور
-- «معلّم» يقرأ ويعدّل تسميعات وتسجيلات صوت وتقييمات وتقدّم وحضور **كل** الطلاب.
-- بعده: المعلّم يرى ويكتب فقط لطلاب الحلقات التي هو معلّمها، عبر
-- teaches_student(معلّم، طالب) من الترحيل 20260922130000 — والطالب يبقى صاحب
-- بياناته كما كان.
--
-- ويُغلَق هنا طريقان كانا يجعلان التقييد شكلياً:
--   • أي معلّم كان يستطيع تعديل أي حلقة (فيضع نفسه معلّماً لها)،
--   • وأي معلّم كان يضيف أي طالب إلى أي حلقة.
-- الآن تُدار الحلقة وأعضاؤها بيد معلّمها أو منشئ مركزها فقط.
--
-- الجداول: recitation_sessions · recitation_assessments · storage(recitations)
--          progress · review_cards · mushaf_records · attendance
--          halaqat · halaqa_students
-- الدوال:  apply_review · mark_attendance
-- ════════════════════════════════════════════════════════════════════

-- teaches_student تُستدعى أيضاً من دوال الخادم بصلاحية service_role.
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO service_role;

-- هل يدير هذا المعلّم الحلقة؟ (معلّمها، أو منشئ المركز الذي تتبعه)
CREATE OR REPLACE FUNCTION public.manages_halaqa(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL
     AND _halaqa IS NOT NULL
     AND public.is_teacher(_uid)
     AND EXISTS (
       SELECT 1
         FROM public.halaqat h
         LEFT JOIN public.centers c ON c.id = h.center_id
        WHERE h.id = _halaqa
          AND (h.teacher_id = _uid OR c.created_by = _uid)
     )
$$;

REVOKE ALL ON FUNCTION public.manages_halaqa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manages_halaqa(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.manages_halaqa IS
  'صحيح إذا كان _uid معلّماً وهو معلّم الحلقة أو منشئ مركزها.';

-- هل المركز من إنشاء هذا المعلّم؟
CREATE OR REPLACE FUNCTION public.owns_center(_uid uuid, _center uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL
     AND public.is_teacher(_uid)
     AND EXISTS (SELECT 1 FROM public.centers c WHERE c.id = _center AND c.created_by = _uid)
$$;

REVOKE ALL ON FUNCTION public.owns_center(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_center(uuid, uuid) TO authenticated, service_role;

-- ═══════════════════════════ التسميعات ═══════════════════════════

-- recitation_sessions: الطالب يُنشئ تسميعه، ومعلّم حلقته يقرأ ويحدّث ويحذف.
DROP POLICY IF EXISTS "read own or teacher" ON public.recitation_sessions;
DROP POLICY IF EXISTS "read own or halaqa teacher" ON public.recitation_sessions;
CREATE POLICY "read own or halaqa teacher" ON public.recitation_sessions
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "update own or teacher" ON public.recitation_sessions;
DROP POLICY IF EXISTS "update own or halaqa teacher" ON public.recitation_sessions;
CREATE POLICY "update own or halaqa teacher" ON public.recitation_sessions
  FOR UPDATE TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  )
  WITH CHECK (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "delete own or teacher" ON public.recitation_sessions;
DROP POLICY IF EXISTS "delete own or halaqa teacher" ON public.recitation_sessions;
CREATE POLICY "delete own or halaqa teacher" ON public.recitation_sessions
  FOR DELETE TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

-- recitation_assessments: معلّم الحلقة يكتب باسمه هو، وعلى تسميع يخصّ الطالب نفسه.
DROP POLICY IF EXISTS "read own or teacher" ON public.recitation_assessments;
DROP POLICY IF EXISTS "read own or halaqa teacher" ON public.recitation_assessments;
CREATE POLICY "read own or halaqa teacher" ON public.recitation_assessments
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "teachers write assessments" ON public.recitation_assessments;
DROP POLICY IF EXISTS "halaqa teacher writes assessments" ON public.recitation_assessments;
CREATE POLICY "halaqa teacher writes assessments" ON public.recitation_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.teaches_student((SELECT auth.uid()), student_id)
    AND teacher_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.recitation_sessions s
       WHERE s.id = session_id AND s.student_id = recitation_assessments.student_id
    )
  );

DROP POLICY IF EXISTS "teachers update assessments" ON public.recitation_assessments;
DROP POLICY IF EXISTS "halaqa teacher updates assessments" ON public.recitation_assessments;
CREATE POLICY "halaqa teacher updates assessments" ON public.recitation_assessments
  FOR UPDATE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id))
  WITH CHECK (public.teaches_student((SELECT auth.uid()), student_id));

DROP POLICY IF EXISTS "teachers delete assessments" ON public.recitation_assessments;
DROP POLICY IF EXISTS "halaqa teacher deletes assessments" ON public.recitation_assessments;
CREATE POLICY "halaqa teacher deletes assessments" ON public.recitation_assessments
  FOR DELETE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id));

-- تسجيلات الصوت: المسار {student_id}/…، فمجلد الطالب يحدّد صاحب الملف.
-- تُحذف السياستان القديمتان كلتاهما (المكرّرتان) لأن السياسات المتساهلة تُجمَع بـ OR.
DROP POLICY IF EXISTS "read own recitations or teacher" ON storage.objects;
DROP POLICY IF EXISTS "recitations read own or teacher" ON storage.objects;
DROP POLICY IF EXISTS "recitations read own or halaqa teacher" ON storage.objects;
CREATE POLICY "recitations read own or halaqa teacher" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recitations'
    AND (
      public.storage_folder_uuid(name) = (SELECT auth.uid())
      OR public.teaches_student((SELECT auth.uid()), public.storage_folder_uuid(name))
    )
  );

DROP POLICY IF EXISTS "delete own recitations or teacher" ON storage.objects;
DROP POLICY IF EXISTS "recitations delete own or teacher" ON storage.objects;
DROP POLICY IF EXISTS "recitations delete own or halaqa teacher" ON storage.objects;
CREATE POLICY "recitations delete own or halaqa teacher" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recitations'
    AND (
      public.storage_folder_uuid(name) = (SELECT auth.uid())
      OR public.teaches_student((SELECT auth.uid()), public.storage_folder_uuid(name))
    )
  );

-- سياسة الرفع القديمة المكرّرة كانت تقبل مجلداً ليس UUID؛ تبقى الأحدث وحدها.
DROP POLICY IF EXISTS "students upload own recitations" ON storage.objects;

-- ═══════════════════════════ التقدّم ═══════════════════════════

DROP POLICY IF EXISTS "read own or teacher reads all" ON public.progress;
DROP POLICY IF EXISTS "read own or halaqa teacher" ON public.progress;
CREATE POLICY "read own or halaqa teacher" ON public.progress
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), user_id)
  );

DROP POLICY IF EXISTS "update own or teacher updates all" ON public.progress;
DROP POLICY IF EXISTS "update own or halaqa teacher" ON public.progress;
CREATE POLICY "update own or halaqa teacher" ON public.progress
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), user_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), user_id)
  );

-- بطاقات المراجعة المتباعدة (SM-2): تُكتب عبر apply_review فقط.
DROP POLICY IF EXISTS "read own cards or teacher" ON public.review_cards;
DROP POLICY IF EXISTS "read own cards or halaqa teacher" ON public.review_cards;
CREATE POLICY "read own cards or halaqa teacher" ON public.review_cards
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

-- سجل المصحف (صفحات الحفظ والمراجعة) جزء من تقدّم الطالب.
DROP POLICY IF EXISTS "read own or teacher reads all mushaf" ON public.mushaf_records;
DROP POLICY IF EXISTS "read own or halaqa teacher mushaf" ON public.mushaf_records;
CREATE POLICY "read own or halaqa teacher mushaf" ON public.mushaf_records
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "teachers insert mushaf" ON public.mushaf_records;
DROP POLICY IF EXISTS "halaqa teacher inserts mushaf" ON public.mushaf_records;
CREATE POLICY "halaqa teacher inserts mushaf" ON public.mushaf_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.teaches_student((SELECT auth.uid()), student_id)
    AND teacher_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "teachers update mushaf" ON public.mushaf_records;
DROP POLICY IF EXISTS "halaqa teacher updates mushaf" ON public.mushaf_records;
CREATE POLICY "halaqa teacher updates mushaf" ON public.mushaf_records
  FOR UPDATE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id))
  WITH CHECK (public.teaches_student((SELECT auth.uid()), student_id));

DROP POLICY IF EXISTS "teachers delete mushaf" ON public.mushaf_records;
DROP POLICY IF EXISTS "halaqa teacher deletes mushaf" ON public.mushaf_records;
CREATE POLICY "halaqa teacher deletes mushaf" ON public.mushaf_records
  FOR DELETE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id));

-- جدولة المراجعة: معلّم الحلقة لطالبه، أو الطالب لنفسه.
CREATE OR REPLACE FUNCTION public.apply_review(
  _student_id uuid,
  _surah_name text,
  _from_ayah integer,
  _to_ayah integer,
  _score integer
)
RETURNS TABLE (due_date date, interval_days integer, ease numeric, repetitions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  q integer := public.sm2_quality(_score);
  card public.review_cards;
  new_ease numeric(4, 2);
  new_interval integer;
  new_reps integer;
  new_lapses integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- يسجّل معلّم الحلقة لطالبه، أو الطالب لنفسه (مراجعة ذاتية).
  IF caller <> _student_id AND NOT public.teaches_student(caller, _student_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  IF _from_ayah < 1 OR _to_ayah < _from_ayah THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  SELECT * INTO card FROM public.review_cards c
   WHERE c.student_id = _student_id
     AND c.surah_name = _surah_name
     AND c.from_ayah = _from_ayah
     AND c.to_ayah = _to_ayah;

  IF card.id IS NULL THEN
    new_ease := 2.50;
    new_reps := 0;
    new_lapses := 0;
  ELSE
    new_ease := card.ease;
    new_reps := card.repetitions;
    new_lapses := card.lapses;
  END IF;

  -- تحديث معامل السهولة (صيغة SM-2 الأصلية)
  new_ease := new_ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  IF new_ease < 1.30 THEN
    new_ease := 1.30;
  END IF;
  IF new_ease > 3.00 THEN
    new_ease := 3.00;
  END IF;

  IF q < 3 THEN
    new_reps := 0;
    new_lapses := new_lapses + 1;
    new_interval := 1;
  ELSE
    new_reps := new_reps + 1;
    new_interval := CASE
      WHEN new_reps = 1 THEN 1
      WHEN new_reps = 2 THEN 4
      ELSE GREATEST(1, ROUND(COALESCE(card.interval_days, 1) * new_ease))::integer
    END;
    -- سقف عملي: لا يتجاوز الفاصل سنة حتى لا يُنسى المقطع فعلياً.
    new_interval := LEAST(new_interval, 365);
  END IF;

  INSERT INTO public.review_cards AS rc (
    student_id, surah_name, from_ayah, to_ayah,
    ease, interval_days, repetitions, lapses,
    last_score, last_reviewed_at, due_date
  )
  VALUES (
    _student_id, _surah_name, _from_ayah, _to_ayah,
    new_ease, new_interval, new_reps, new_lapses,
    _score, now(), (now()::date + new_interval)
  )
  ON CONFLICT (student_id, surah_name, from_ayah, to_ayah) DO UPDATE
    SET ease = EXCLUDED.ease,
        interval_days = EXCLUDED.interval_days,
        repetitions = EXCLUDED.repetitions,
        lapses = EXCLUDED.lapses,
        last_score = EXCLUDED.last_score,
        last_reviewed_at = EXCLUDED.last_reviewed_at,
        due_date = EXCLUDED.due_date;

  RETURN QUERY
    SELECT c.due_date, c.interval_days, c.ease, c.repetitions
      FROM public.review_cards c
     WHERE c.student_id = _student_id
       AND c.surah_name = _surah_name
       AND c.from_ayah = _from_ayah
       AND c.to_ayah = _to_ayah;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_review(uuid, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_review(uuid, text, integer, integer, integer) TO authenticated;


-- ═══════════════════════════ الحضور ═══════════════════════════

DROP POLICY IF EXISTS "read own or teacher" ON public.attendance;
DROP POLICY IF EXISTS "read own or halaqa teacher" ON public.attendance;
CREATE POLICY "read own or halaqa teacher" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

-- الكتابة المباشرة: لطالب في حلقاته، وإن ذُكرت حلقة فيجب أن تكون حلقته.
DROP POLICY IF EXISTS "teachers insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "halaqa teacher inserts attendance" ON public.attendance;
CREATE POLICY "halaqa teacher inserts attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.teaches_student((SELECT auth.uid()), student_id)
    AND (halaqa_id IS NULL OR public.manages_halaqa((SELECT auth.uid()), halaqa_id))
  );

DROP POLICY IF EXISTS "teachers update attendance" ON public.attendance;
DROP POLICY IF EXISTS "halaqa teacher updates attendance" ON public.attendance;
CREATE POLICY "halaqa teacher updates attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id))
  WITH CHECK (
    public.teaches_student((SELECT auth.uid()), student_id)
    AND (halaqa_id IS NULL OR public.manages_halaqa((SELECT auth.uid()), halaqa_id))
  );

DROP POLICY IF EXISTS "teachers delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "halaqa teacher deletes attendance" ON public.attendance;
CREATE POLICY "halaqa teacher deletes attendance" ON public.attendance
  FOR DELETE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id));

CREATE OR REPLACE FUNCTION public.mark_attendance(
  _student_id uuid,
  _halaqa_id uuid,
  _session_date date,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  row_id uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT public.is_teacher(caller) THEN
    RAISE EXCEPTION 'TEACHER_ONLY';
  END IF;

  -- الطالب من طلاب حلقاته، والحلقة المذكورة (إن وُجدت) حلقته وفيها الطالب.
  IF NOT public.teaches_student(caller, _student_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_STUDENT';
  END IF;

  IF _halaqa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.halaqa_students hs
      JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE hs.halaqa_id = _halaqa_id
       AND hs.student_id = _student_id
       AND h.teacher_id = caller
  ) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;

  IF _status NOT IN ('present', 'absent', 'late', 'excused') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  IF _session_date > (now()::date + 1) THEN
    RAISE EXCEPTION 'FUTURE_DATE';
  END IF;

  UPDATE public.attendance
     SET status = _status,
         reason = _reason,
         teacher_id = caller,
         updated_at = now()
   WHERE student_id = _student_id
     AND session_date = _session_date
     AND COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid)
  RETURNING id INTO row_id;

  IF row_id IS NULL THEN
    INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status, reason)
    VALUES (_student_id, _halaqa_id, caller, _session_date, _status, _reason)
    RETURNING id INTO row_id;
  END IF;

  RETURN row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_attendance(uuid, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, uuid, date, text, text) TO authenticated;

-- ═══════════════ إدارة الحلقات: لا التفاف على التقييد ═══════════════

-- إنشاء حلقة: في مركز أنشأه، أو يكون هو معلّمها.
DROP POLICY IF EXISTS "teachers insert halaqat" ON public.halaqat;
CREATE POLICY "teachers insert halaqat" ON public.halaqat
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_teacher((SELECT auth.uid())))
    AND (
      teacher_id = (SELECT auth.uid())
      OR public.owns_center((SELECT auth.uid()), center_id)
    )
  );

-- تعديل حلقة: معلّمها أو منشئ مركزها. ولا ينقلها معلّمها إلى معلّم آخر إلا منشئ المركز.
DROP POLICY IF EXISTS "teachers update halaqat" ON public.halaqat;
CREATE POLICY "teachers update halaqat" ON public.halaqat
  FOR UPDATE TO authenticated
  USING (public.manages_halaqa((SELECT auth.uid()), id))
  WITH CHECK (
    public.owns_center((SELECT auth.uid()), center_id)
    OR (teacher_id = (SELECT auth.uid()) AND public.manages_halaqa((SELECT auth.uid()), id))
  );

DROP POLICY IF EXISTS "teachers delete halaqat" ON public.halaqat;
CREATE POLICY "teachers delete halaqat" ON public.halaqat
  FOR DELETE TO authenticated
  USING (public.manages_halaqa((SELECT auth.uid()), id));

-- أعضاء الحلقة: يضيفهم ويحذفهم معلّمها أو منشئ مركزها فقط.
DROP POLICY IF EXISTS "teachers add members" ON public.halaqa_students;
CREATE POLICY "teachers add members" ON public.halaqa_students
  FOR INSERT TO authenticated
  WITH CHECK (public.manages_halaqa((SELECT auth.uid()), halaqa_id));

DROP POLICY IF EXISTS "teachers remove members" ON public.halaqa_students;
CREATE POLICY "teachers remove members" ON public.halaqa_students
  FOR DELETE TO authenticated
  USING (public.manages_halaqa((SELECT auth.uid()), halaqa_id));
