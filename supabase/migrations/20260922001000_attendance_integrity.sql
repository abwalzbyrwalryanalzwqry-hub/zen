-- ════════════════════════════════════════════════════════════════════
-- سلامة سجل الحضور
--
-- المشكلة: الفهرس الفريد attendance_unique_day على
-- (student_id, halaqa_id, session_date) لا يمنع التكرار عندما يكون
-- halaqa_id = NULL، لأن NULL لا يساوي NULL في PostgreSQL. وحين تُحذف حلقة
-- تصبح halaqa_id = NULL (ON DELETE SET NULL)، فتتكوّن صفوف حضور مكرّرة
-- لنفس الطالب في نفس اليوم، و upsert(onConflict) لا يجد صفاً مطابقاً
-- فيُضيف صفاً جديداً في كل مرة ⇒ إحصاءات حضور خاطئة.
--
-- الحل: تنظيف المكرّر + فهرس فريد على تعبير COALESCE + دالة تسجيل واحدة.
-- ════════════════════════════════════════════════════════════════════

-- ─────────── 1. تنظيف الصفوف المكرّرة (يُبقي الأحدث) ───────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id,
                   COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   session_date
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.attendance
)
DELETE FROM public.attendance a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

-- ─────────── 2. فهرس فريد يشمل حالة NULL ───────────
DROP INDEX IF EXISTS public.attendance_unique_day;

CREATE UNIQUE INDEX attendance_unique_day
  ON public.attendance (
    student_id,
    COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid),
    session_date
  );

-- فهارس القراءة الشائعة (لوحة المعلم تقرأ بالحلقة واليوم)
CREATE INDEX IF NOT EXISTS attendance_halaqa_date_idx
  ON public.attendance (halaqa_id, session_date DESC);
CREATE INDEX IF NOT EXISTS attendance_student_date_idx
  ON public.attendance (student_id, session_date DESC);

-- ─────────── 3. دالة تسجيل الحضور (بدل upsert من العميل) ───────────
-- upsert من العميل لا يستطيع استهداف فهرس على تعبير، فالمنطق ينتقل هنا.
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

REVOKE ALL ON FUNCTION public.mark_attendance(uuid, uuid, date, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, uuid, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.mark_attendance IS
  'تسجيل حضور الطالب أو تحديثه ليوم واحد، بصف واحد فقط لكل (طالب، حلقة، يوم) حتى لو كانت الحلقة NULL.';

-- ─────────── 4. قيد الحالة على مستوى الجدول ───────────
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_valid;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_valid
  CHECK (status IN ('present', 'absent', 'late', 'excused'));
