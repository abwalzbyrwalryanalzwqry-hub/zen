-- ════════════════════════════════════════════════════════════════════
-- محرّك الاختبارات القرآنية — جداول الاختبارات والمحاولات والنتائج
--
-- التوليد والتصحيح كلّه في العميل (يعمل دون اتصال ومن متن محلي ببصمة)، وهذه
-- الجداول للسجل والمزامنة ومتابعة المعلّم. لذلك:
--   • تُحفَظ لقطة الاختبار كاملة (jsonb) لأنها غير قابلة للتغيير بعد البدء،
--     فإعادة عرض الاختبار بعد شهر يجب أن تُظهر نفس الأسئلة نفسها.
--   • تُحفَظ البذرة وبصمة المتن، فأي اختبار قابل لإعادة الإنتاج حرفياً.
--   • الطالب يكتب محاولاته فقط، والمعلّم يقرأ نتائج طلابه ولا يعدّلها.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- عنوان يُعرض في السجل (وصف النطاق بأسماء السور).
  title text NOT NULL,
  scope_label text NOT NULL,
  scope jsonb NOT NULL,
  blueprint jsonb NOT NULL,
  -- اللقطة المجمّدة: الأسئلة والخيارات والإجابات الصحيحة ومراجعها.
  snapshot jsonb NOT NULL,
  question_count integer NOT NULL CHECK (question_count BETWEEN 1 AND 50),
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'mastery')),
  mode text NOT NULL CHECK (mode IN ('practice', 'exam')),
  seed text NOT NULL,
  corpus_sha256 text NOT NULL,
  engine_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exams_student_idx ON public.exams (student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
  current_index integer NOT NULL DEFAULT 0,
  -- إجابات المستخدم: { questionId: { value, flagged, seconds, answeredAt } }
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_attempts_exam_idx ON public.exam_attempts (exam_id);
CREATE INDEX IF NOT EXISTS exam_attempts_resume_idx
  ON public.exam_attempts (student_id, status) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS public.exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0),
  possible integer NOT NULL CHECK (possible > 0),
  percentage integer NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  mastery text NOT NULL
    CHECK (mastery IN ('mastery', 'proficient', 'good', 'needs_review', 'weak')),
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  -- تحليل الأداء بعائلة السؤال وبمستوى الصعوبة.
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_results_student_idx
  ON public.exam_results (student_id, created_at DESC);

-- مواضع الخطأ: مقاطع قرآنية أخطأ فيها الطالب، وهي الجسر إلى نظام المراجعة.
CREATE TABLE IF NOT EXISTS public.exam_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.exam_results(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surah_number integer NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
  surah_name text NOT NULL,
  from_ayah integer NOT NULL CHECK (from_ayah >= 1),
  to_ayah integer NOT NULL CHECK (to_ayah >= 1),
  errors integer NOT NULL DEFAULT 1 CHECK (errors >= 1),
  -- هل أُرسل هذا الموضع إلى نظام المراجعة المتباعدة؟
  sent_to_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_ayah >= from_ayah)
);

CREATE INDEX IF NOT EXISTS exam_errors_student_idx
  ON public.exam_errors (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_errors_pending_review_idx
  ON public.exam_errors (student_id) WHERE NOT sent_to_review;

-- ─────────────────────────── الصلاحيات ───────────────────────────

GRANT SELECT, INSERT ON public.exams TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.exam_attempts TO authenticated;
GRANT SELECT, INSERT ON public.exam_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.exam_errors TO authenticated;
GRANT ALL ON public.exams, public.exam_attempts, public.exam_results, public.exam_errors
  TO service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_errors ENABLE ROW LEVEL SECURITY;

-- الاختبارات: الطالب يقرأ ويُنشئ اختباراته، والمعلّم يقرأ اختبارات طلابه.
DROP POLICY IF EXISTS "read own exams or teacher" ON public.exams;
CREATE POLICY "read own exams or teacher" ON public.exams
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "insert own exams" ON public.exams;
CREATE POLICY "insert own exams" ON public.exams
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

-- المحاولات: الطالب وحده يكتب، والمعلّم يقرأ. لا تعديل بعد التسليم.
DROP POLICY IF EXISTS "read own attempts or teacher" ON public.exam_attempts;
CREATE POLICY "read own attempts or teacher" ON public.exam_attempts
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "insert own attempts" ON public.exam_attempts;
CREATE POLICY "insert own attempts" ON public.exam_attempts
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "update own open attempts" ON public.exam_attempts;
CREATE POLICY "update own open attempts" ON public.exam_attempts
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) AND status = 'in_progress')
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "read own results or teacher" ON public.exam_results;
CREATE POLICY "read own results or teacher" ON public.exam_results
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "insert own results" ON public.exam_results;
CREATE POLICY "insert own results" ON public.exam_results
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "read own errors or teacher" ON public.exam_errors;
CREATE POLICY "read own errors or teacher" ON public.exam_errors
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "insert own errors" ON public.exam_errors;
CREATE POLICY "insert own errors" ON public.exam_errors
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "update own errors" ON public.exam_errors;
CREATE POLICY "update own errors" ON public.exam_errors
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

CREATE TRIGGER exam_attempts_updated_at
  BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.progress_touch_updated_at();

-- ───────────── الجسر إلى المراجعة المتباعدة (SM-2) ─────────────
-- لا تُعاد كتابة SM-2: تُرسَل إشارة فقط إلى apply_review بدرجة منخفضة تُشتق من
-- عدد الأخطاء، فيتولّى نظام المراجعة القائم حساب الموعد.
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
  IF owner <> caller AND NOT public.is_teacher(caller) THEN
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

COMMENT ON FUNCTION public.send_exam_errors_to_review IS
  'يرسل مواضع الخطأ في اختبار إلى نظام المراجعة المتباعدة عبر apply_review (SM-2) دون تغييره.';
