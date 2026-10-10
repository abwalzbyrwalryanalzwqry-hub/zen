-- فحص الأقسام P2 (C6): «محادثة جديدة» تعرف صلة كل جهة اتصال بصاحب الحساب، فتُجمَّع
-- (طلابي، أولياء أمورهم، معلّمي، معلّمو أبنائي، زملائي) بدل «معلم/طالب» من profiles.role الذي يخطئ
-- مع أولياء الأمور. نفس مصادر my_chat_contacts ونفس شرط can_start_chat، ولكل شخص أقرب صلة.
CREATE OR REPLACE FUNCTION public.my_chat_contacts_detailed()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rel AS (
    SELECT hs.student_id AS u, 'my_student'::text AS relation, NULL::text AS via, 1 AS rank
      FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE h.teacher_id = auth.uid()
    UNION ALL
    SELECT h.teacher_id, 'my_teacher', NULL, 1
      FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE hs.student_id = auth.uid()
    UNION ALL
    SELECT g.guardian_id, 'student_guardian', c.name, 2
      FROM public.guardian_links g JOIN public.profiles c ON c.id = g.student_id
     WHERE public.teaches_student(auth.uid(), g.student_id)
    UNION ALL
    SELECT h.teacher_id, 'child_teacher', c.name, 2
      FROM public.guardian_links g
      JOIN public.halaqa_students hs ON hs.student_id = g.student_id
      JOIN public.halaqat h ON h.id = hs.halaqa_id
      JOIN public.profiles c ON c.id = g.student_id
     WHERE g.guardian_id = auth.uid()
    UNION ALL
    SELECT y.student_id, 'classmate', NULL, 3
      FROM public.halaqa_students x JOIN public.halaqa_students y ON y.halaqa_id = x.halaqa_id
     WHERE x.student_id = auth.uid()
    UNION ALL
    SELECT h.teacher_id, 'colleague', NULL, 4
      FROM public.halaqat h
     WHERE public.is_teacher(auth.uid())
  ),
  best AS (
    SELECT DISTINCT ON (u) u, relation, via
      FROM rel
     WHERE u IS NOT NULL AND u <> auth.uid()
     ORDER BY u, rank, via
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', b.u, 'name', p.name, 'avatar', p.avatar, 'relation', b.relation, 'via', b.via)
           ORDER BY b.relation, p.name), '[]'::jsonb)
    FROM best b JOIN public.profiles p ON p.id = b.u
   WHERE public.can_start_chat(auth.uid(), b.u)
$$;
REVOKE ALL ON FUNCTION public.my_chat_contacts_detailed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_chat_contacts_detailed() TO authenticated;

COMMENT ON FUNCTION public.my_chat_contacts_detailed() IS
  'جهات الاتصال المسموحة مع صلة كل منها (my_student، my_teacher، student_guardian، child_teacher، classmate، colleague).';
