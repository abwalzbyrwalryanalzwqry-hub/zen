-- ════════════════════════════════════════════════════════════════════
-- تحليل قسم «المزيد» (GAP-01): شارات «المزيد» في نداء واحد.
--
-- كانت «المزيد» قائمة صامتة: لا تعرف أن عندك إشعارات غير مقروءة أو دعوة حلقة
-- تنتظر ردّك أو طلاباً متعثّرين. more_badges() تعدّ ذلك من الخادم لمستخدم الجلسة
-- وحده، دون أي محتوى (أعداد فقط)، فيرسمها العميل بجانب المدخل المعني.
--   notifications  إشعارات غير مقروءة
--   invites        دعوات حلقة تنتظرني: لي (pending) أو لأحد أبنائي (awaiting_guardian)
--   at_risk        طلاب متعثّرون في حلقاتي (للمعلّم وحده؛ 0 لغيره)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.more_badges()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN jsonb_build_object(
    'notifications', (
      SELECT count(*) FROM public.notifications n WHERE n.user_id = caller AND NOT n.read),
    'invites', (
      SELECT count(*) FROM public.halaqa_invites i
       WHERE (i.student_id = caller AND i.status = 'pending')
          OR (i.status = 'awaiting_guardian' AND EXISTS (
                SELECT 1 FROM public.guardian_links g
                 WHERE g.guardian_id = caller AND g.student_id = i.student_id))),
    'at_risk', CASE WHEN public.is_teacher(caller)
                    THEN jsonb_array_length(public.at_risk_students(NULL)) ELSE 0 END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.more_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.more_badges() TO authenticated;

COMMENT ON FUNCTION public.more_badges() IS
  'شارات «المزيد»: الإشعارات غير المقروءة، والدعوات المنتظرة، والطلاب المتعثّرون (للمعلّم).';
