-- ════════════════════════════════════════════════════════════════════════════
-- إدارة المعلّم لطلابه: تعديل الاسم وإزالة الطالب من الحلقة
-- ════════════════════════════════════════════════════════════════════════════
-- teacher_update_student: يعدّل معلّم حلقة الطالب اسمه، للحسابات التي أنشأها معلّم فقط
--   (raw_app_meta_data.created_by_teacher)؛ صاحب الحساب المسجَّل بنفسه يدير اسمه من حسابه.
--   الطالب ليس معلّماً (فلا يُعدَّل حساب معلّم آخر).
-- teacher_remove_student: يزيل الطالب من حلقة يديرها المستدعي (أو من كل حلقاته إن لم تُحدَّد)،
--   ويعيد عدد الحلقات التي أُزيل منها. لا يمسّ حساب الطالب ولا سجله السابق.
-- student_login_info: يضيف managed (حساب أنشأه معلّم فيُعدَّل اسمه) وname، بلا حذف لمفاتيحه السابقة.
-- التراجع: DROP FUNCTION public.teacher_update_student(uuid, text), public.teacher_remove_student(uuid, uuid);
--   وإعادة student_login_info من 20261005100000.
-- الفحص: supabase/tests/checks.sql (140).

CREATE OR REPLACE FUNCTION public.teacher_update_student(_student uuid, _name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  display_name text := left(btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')), 60);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _student IS NULL OR _student = caller
     OR NOT public.teaches_student(caller, _student)
     OR public.is_teacher(_student) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _student AND u.raw_app_meta_data ? 'created_by_teacher') THEN
    RAISE EXCEPTION 'not_managed' USING ERRCODE = '42501';
  END IF;
  IF char_length(display_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET name = display_name WHERE id = _student;
  UPDATE auth.users
     SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', display_name)
   WHERE id = _student;
  RETURN jsonb_build_object('student_id', _student, 'name', display_name);
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_update_student(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_update_student(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teacher_remove_student(_student uuid, _halaqa uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  n integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _student IS NULL THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF _halaqa IS NOT NULL AND NOT public.manages_halaqa(caller, _halaqa) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.halaqa_students hs
   WHERE hs.student_id = _student
     AND (CASE WHEN _halaqa IS NULL THEN public.manages_halaqa(caller, hs.halaqa_id) ELSE hs.halaqa_id = _halaqa END);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'not_member' USING ERRCODE = '42501'; END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_remove_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_remove_student(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.student_login_info(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.teaches_student(caller, _student) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'username', (SELECT username FROM public.account_usernames WHERE user_id = _student),
    'can_set_password', NOT public.is_teacher(_student),
    'password_set_at', (SELECT password_set_at FROM public.account_secrets WHERE user_id = _student),
    'name', (SELECT p.name FROM public.profiles p WHERE p.id = _student),
    'managed', NOT public.is_teacher(_student) AND EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = _student AND u.raw_app_meta_data ? 'created_by_teacher')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.student_login_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_login_info(uuid) TO authenticated;
