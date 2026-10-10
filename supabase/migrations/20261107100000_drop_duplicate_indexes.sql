-- ════════════════════════════════════════════════════════════════════════════
-- إزالة الفهارس المكرّرة (مستشار الأداء: duplicate_index)
-- ════════════════════════════════════════════════════════════════════════════
-- ترحيل 14.4 (20261106100000_center_dashboard_perf) أنشأ فهرسين مطابقين حرفياً لفهرسين قديمين
-- (student_id, created_at DESC). كل فهرس مكرّر يبطئ الكتابة ويأخذ مساحة دون أي فائدة للقراءة.
-- يبقى الاسمان الجديدان لأن الفحص 116 يعتمد عليهما، ويُحذف القديمان:
--   exam_results_student_idx        (20260922120000_exam_engine)            = exam_results_student_created_idx
--   assessments_student_created_idx (20260922002000_rls_performance_and_indexes) = recitation_assessments_student_created_idx
-- الحذف آمن فقط لأن البديل موجود؛ نتحقق منه قبل الحذف حتى لا يبقى الجدول بلا فهرس.

DO $$
BEGIN
  IF to_regclass('public.exam_results_student_created_idx') IS NULL
     OR to_regclass('public.recitation_assessments_student_created_idx') IS NULL THEN
    RAISE EXCEPTION 'الفهرس البديل غير موجود؛ طبّق 20261106100000_center_dashboard_perf أولاً';
  END IF;
END $$;

DROP INDEX IF EXISTS public.exam_results_student_idx;
DROP INDEX IF EXISTS public.assessments_student_created_idx;
