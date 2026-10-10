-- ════════════════════════════════════════════════════════════════════
-- تقييد قراءة المعلّم لاختبارات الطلاب على طلاب حلقاته فقط
--
-- قبل هذا الترحيل: سياسات جداول الاختبارات تسمح لأي صاحب دور «معلّم» بقراءة
-- اختبارات ونتائج ومواضع خطأ **كل** الطلاب، ودالة الإرسال إلى المراجعة تسمح لأي
-- معلّم بتعديل جدول مراجعة أي طالب.
-- بعده: المعلّم يرى ويتصرّف فقط في طلاب الحلقات التي هو معلّمها
-- (halaqat.teacher_id)، وبشرط أن يبقى دوره «معلّم» في user_roles — فسحب الدور
-- يسحب الوصول فوراً دون انتظار تعديل الحلقات.
-- ════════════════════════════════════════════════════════════════════

-- هل يُدرّس هذا المعلّمُ هذا الطالبَ في إحدى حلقاته؟
-- SECURITY DEFINER: تُقرأ الحلقات وأعضاؤها دون المرور بسياساتها، فلا تتداخل
-- السياسات ولا يتكرّر تقييمها لكل صف.
CREATE OR REPLACE FUNCTION public.teaches_student(_teacher uuid, _student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _teacher IS NOT NULL
     AND _student IS NOT NULL
     AND public.is_teacher(_teacher)
     AND EXISTS (
       SELECT 1
         FROM public.halaqa_students hs
         JOIN public.halaqat h ON h.id = hs.halaqa_id
        WHERE hs.student_id = _student
          AND h.teacher_id = _teacher
     )
$$;

REVOKE ALL ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.teaches_student IS
  'صحيح إذا كان _teacher معلّماً (user_roles) ومعلّمَ حلقة فيها _student.';

-- فهرس يخدم الشرط h.teacher_id = … مع الانضمام إلى الأعضاء.
CREATE INDEX IF NOT EXISTS halaqa_students_student_halaqa_idx
  ON public.halaqa_students (student_id, halaqa_id);

-- ─────────────────────── سياسات القراءة ───────────────────────

DROP POLICY IF EXISTS "read own exams or teacher" ON public.exams;
DROP POLICY IF EXISTS "read own exams or halaqa teacher" ON public.exams;
CREATE POLICY "read own exams or halaqa teacher" ON public.exams
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "read own attempts or teacher" ON public.exam_attempts;
DROP POLICY IF EXISTS "read own attempts or halaqa teacher" ON public.exam_attempts;
CREATE POLICY "read own attempts or halaqa teacher" ON public.exam_attempts
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "read own results or teacher" ON public.exam_results;
DROP POLICY IF EXISTS "read own results or halaqa teacher" ON public.exam_results;
CREATE POLICY "read own results or halaqa teacher" ON public.exam_results
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "read own errors or teacher" ON public.exam_errors;
DROP POLICY IF EXISTS "read own errors or halaqa teacher" ON public.exam_errors;
CREATE POLICY "read own errors or halaqa teacher" ON public.exam_errors
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

-- ───────────── الإرسال إلى المراجعة: صاحب النتيجة أو معلّم حلقته ─────────────

CREATE OR REPLACE FUNCTION public.send_exam_errors_to_review(_result_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  owner uuid;
  moved integer := 0;
  row_error public.exam_errors;
  derived_score integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT student_id INTO owner FROM public.exam_results WHERE id = _result_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'RESULT_NOT_FOUND';
  END IF;
  IF owner <> caller AND NOT public.teaches_student(caller, owner) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  FOR row_error IN
    SELECT * FROM public.exam_errors
     WHERE result_id = _result_id AND NOT sent_to_review
  LOOP
    -- خطأ واحد ⇒ 55 (تعثّر خفيف)، وكل خطأ إضافي يخفض الدرجة حتى 20.
    derived_score := GREATEST(20, 55 - (row_error.errors - 1) * 10);
    PERFORM public.apply_review(
      owner,
      row_error.surah_name,
      row_error.from_ayah,
      row_error.to_ayah,
      derived_score
    );
    UPDATE public.exam_errors SET sent_to_review = true WHERE id = row_error.id;
    moved := moved + 1;
  END LOOP;

  RETURN moved;
END;
$$;

REVOKE ALL ON FUNCTION public.send_exam_errors_to_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_exam_errors_to_review(uuid) TO authenticated;

-- ─────────────── قائمة طلاب المعلّم لتقرير الاختبارات ───────────────
-- معرّفات طلاب حلقات المعلّم الحالي. تُستخدم في الواجهة لتحديد من «لم يختبر»،
-- والصلاحية الفعلية على البيانات تبقى في السياسات أعلاه.
CREATE OR REPLACE FUNCTION public.my_halaqa_student_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT hs.student_id
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE h.teacher_id = auth.uid()
     AND public.is_teacher(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.my_halaqa_student_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_halaqa_student_ids() TO authenticated;
