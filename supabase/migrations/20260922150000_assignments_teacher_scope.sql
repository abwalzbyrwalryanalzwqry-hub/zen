-- ════════════════════════════════════════════════════════════════════
-- تقييد الواجبات على طلاب حلقات المعلّم
--
-- قبل هذا الترحيل: أي صاحب دور «معلّم» يقرأ واجبات كل الطلاب ويعدّلها
-- ويحذفها، ويُسند واجباً لأي طالب وباسم أي معلّم.
-- بعده (بالشرط نفسه في 20260922130000 و20260922140000):
--   • القراءة والتعديل: الطالب لواجباته، أو معلّم حلقته.
--   • الإسناد: لطالب في حلقاته، باسمه هو، وفي حلقته إن ذُكرت حلقة.
--   • الحذف: معلّم حلقة الطالب.
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "students read own assignments" ON public.assignments;
DROP POLICY IF EXISTS "read own or halaqa teacher" ON public.assignments;
CREATE POLICY "read own or halaqa teacher" ON public.assignments
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "students update own assignments" ON public.assignments;
DROP POLICY IF EXISTS "update own or halaqa teacher" ON public.assignments;
CREATE POLICY "update own or halaqa teacher" ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  )
  WITH CHECK (
    student_id = (SELECT auth.uid())
    OR (
      public.teaches_student((SELECT auth.uid()), student_id)
      AND (halaqa_id IS NULL OR public.manages_halaqa((SELECT auth.uid()), halaqa_id))
    )
  );

DROP POLICY IF EXISTS "teachers insert assignments" ON public.assignments;
DROP POLICY IF EXISTS "halaqa teacher assigns" ON public.assignments;
CREATE POLICY "halaqa teacher assigns" ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.teaches_student((SELECT auth.uid()), student_id)
    AND teacher_id = (SELECT auth.uid())
    AND (halaqa_id IS NULL OR public.manages_halaqa((SELECT auth.uid()), halaqa_id))
  );

DROP POLICY IF EXISTS "teachers delete assignments" ON public.assignments;
DROP POLICY IF EXISTS "halaqa teacher deletes assignments" ON public.assignments;
CREATE POLICY "halaqa teacher deletes assignments" ON public.assignments
  FOR DELETE TO authenticated
  USING (public.teaches_student((SELECT auth.uid()), student_id));

-- قراءة المعلّم لواجبات طلابه تمرّ بالطالب؛ الفهرس يخدم الشرط والترتيب.
CREATE INDEX IF NOT EXISTS assignments_student_due_idx
  ON public.assignments (student_id, due_date DESC);
