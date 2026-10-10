-- ════════════════════════════════════════════════════════════════════
-- المحادثات بين زملاء الحلقة الواحدة
--
-- يوسّع can_start_chat (المرحلة 5) ليسمح ببدء محادثة ثنائية بين طالبين
-- عضوين في الحلقة نفسها. يبقى الممنوع: طالب ↔ طالب من حلقة أخرى، وأي
-- شخص ↔ غريب، والمحادثات الجماعية.
-- الفحوص: supabase/tests/checks.sql (40–41).
-- ════════════════════════════════════════════════════════════════════

-- هل الطالبان عضوان في حلقة واحدة على الأقل؟
CREATE OR REPLACE FUNCTION public.are_classmates(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _a IS NOT NULL
     AND _b IS NOT NULL
     AND _a <> _b
     AND EXISTS (
       SELECT 1
         FROM public.halaqa_students x
         JOIN public.halaqa_students y ON y.halaqa_id = x.halaqa_id
        WHERE x.student_id = _a
          AND y.student_id = _b
     )
$$;

REVOKE ALL ON FUNCTION public.are_classmates(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_classmates(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_start_chat(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _a IS NOT NULL
     AND _b IS NOT NULL
     AND _a <> _b
     AND (
       public.teaches_student(_a, _b)
       OR public.teaches_student(_b, _a)
       OR (public.is_teacher(_a) AND public.is_teacher(_b))
       OR public.are_classmates(_a, _b)
     )
$$;

CREATE OR REPLACE FUNCTION public.my_chat_contacts()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- طلاب حلقاتي (إن كنت معلّماً)
  SELECT DISTINCT hs.student_id
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE h.teacher_id = auth.uid()
     AND public.is_teacher(auth.uid())
  UNION
  -- معلّمو حلقاتي (إن كنت طالباً فيها)
  SELECT DISTINCT h.teacher_id
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE hs.student_id = auth.uid()
     AND h.teacher_id IS NOT NULL
     AND public.is_teacher(h.teacher_id)
  UNION
  -- زملائي في الحلقات نفسها
  SELECT DISTINCT y.student_id
    FROM public.halaqa_students x
    JOIN public.halaqa_students y ON y.halaqa_id = x.halaqa_id
   WHERE x.student_id = auth.uid()
     AND y.student_id <> auth.uid()
  UNION
  -- بقية المعلّمين (إن كنت معلّماً)
  SELECT ur.user_id
    FROM public.user_roles ur
   WHERE ur.role = 'teacher'
     AND public.is_teacher(auth.uid())
     AND ur.user_id <> auth.uid()
$$;
