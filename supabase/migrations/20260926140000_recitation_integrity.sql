-- ════════════════════════════════════════════════════════════════════
-- سلامة التسميعات: التحليل الآلي والحالة لا يزوّرهما العميل
--
-- 1. التفريغ ودرجة المطابقة والتحليل (transcript · ai_score · ai_analysis) يكتبها
--    الخادم وحده (service_role) بعد تحليل الصوت المخزَّن فعلاً. أي قيمة يرسلها
--    العميل تُتجاهل، فلا يرى المعلّم «درجة آلية» كتبها الطالب بنفسه.
-- 2. الحالة: الطالب لا يعتمد تسميعه. يُنشئه «تدريباً» (practice) أو «بانتظار
--    المعلم»، ولا ينقله إلا من التدريب إلى بانتظار المعلم. والاعتماد وطلب
--    الإعادة لمعلّم حلقته فقط.
-- 3. حالة جديدة «practice» لصفحة التسميع الذاتي: لا تظهر في قائمة المعلّم.
--
-- الفحص: supabase/tests/checks.sql (42).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.recitation_sessions
  DROP CONSTRAINT IF EXISTS recitation_sessions_status_check;
ALTER TABLE public.recitation_sessions
  ADD CONSTRAINT recitation_sessions_status_check
  CHECK (status IN ('recording', 'uploading', 'practice', 'awaiting_teacher', 'approved', 'redo'))
  NOT VALID;

CREATE OR REPLACE FUNCTION public.recitation_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- الخادم (service_role) والمالك (postgres) يكتبان بحرية.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.transcript := NULL;
    NEW.ai_score := NULL;
    NEW.ai_analysis := NULL;
    IF NEW.status IS NULL OR NEW.status NOT IN ('practice', 'awaiting_teacher', 'recording', 'uploading') THEN
      NEW.status := 'awaiting_teacher';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: حقول التحليل وصاحب التسميع لا تتغيّر من العميل.
  NEW.transcript := OLD.transcript;
  NEW.ai_score := OLD.ai_score;
  NEW.ai_analysis := OLD.ai_analysis;
  NEW.student_id := OLD.student_id;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.teaches_student(auth.uid(), OLD.student_id) THEN
      IF NEW.status NOT IN ('approved', 'redo', 'awaiting_teacher') THEN
        RAISE EXCEPTION 'INVALID_STATUS';
      END IF;
    ELSIF OLD.student_id = auth.uid() THEN
      IF NOT (OLD.status IN ('practice', 'recording', 'uploading') AND NEW.status = 'awaiting_teacher') THEN
        RAISE EXCEPTION 'STATUS_NOT_ALLOWED';
      END IF;
    ELSE
      RAISE EXCEPTION 'STATUS_NOT_ALLOWED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recitation_sessions_guard ON public.recitation_sessions;
CREATE TRIGGER recitation_sessions_guard
  BEFORE INSERT OR UPDATE ON public.recitation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.recitation_sessions_guard();
