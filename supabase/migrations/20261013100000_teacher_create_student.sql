-- المرحلة 6.1: المعلّم ينشئ حساب طالب باسم مستخدم وكلمة مرور، من قاعدة البيانات مباشرة.
--
-- كان إنشاء الطالب دالة خادم (createStudentAccount) تنشئ حساباً برقم هاتف، فلا تعمل في نسخة Android
-- بلا خادم منشور، ولا يستطيع الطالب الدخول به أصلاً لأن مزوّد الرسائل القصيرة غير مفعّل. الدخول صار
-- باسم مستخدم وكلمة مرور (20261005100000_username_auth)، فالحساب يُنشأ هنا بالطريقة نفسها التي يُنشئ
-- بها register_username_account حسابه، مع شروط المعلّم:
--   - الحلقة إلزامية، والمنشئ يدير الحلقة (manages_halaqa: معلّمها أو منشئ مركزها).
--   - حساب جديد تماماً ⇒ يُضمّ إلى الحلقة مباشرة (القاعدة 8 في HANDOFF). الحساب القائم لا يمر من هنا
--     (اسم مستخدم مأخوذ ⇒ خطأ)، والطالب المسجّل يُدعى بـ invite_to_halaqa كما هو.
--   - كلمة المرور يضعها المعلّم، فيُلزَم الطالب بتغييرها عند أول دخول (must_change_password).
--   - حدّ 120 حساباً في الساعة لكل معلّم، و300 في الساعة للمشروع (مع حدّ التسجيل العام نفسه).

CREATE OR REPLACE FUNCTION public._is_reserved_username(_u text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _u = ANY (ARRAY['admin', 'administrator', 'root', 'support', 'zen', 'zen_app', 'system',
                         'teacher', 'student', 'moderator', 'مدير', 'المدير', 'الدعم', 'زين', 'مشرف']);
$$;
REVOKE ALL ON FUNCTION public._is_reserved_username(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.teacher_create_student(
  _halaqa uuid,
  _username text,
  _password text,
  _name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  u text := public.normalize_username(_username);
  display_name text := left(btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')), 60);
  mail text;
  new_id uuid := gen_random_uuid();
  code text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.' USING ERRCODE = '42501';
  END IF;
  IF _halaqa IS NULL OR NOT public.manages_halaqa(caller, _halaqa) THEN
    RAISE EXCEPTION 'not_allowed: لا يمكنك إضافة طلاب إلى حلقة ليست حلقتك.' USING ERRCODE = '42501';
  END IF;
  IF char_length(display_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name: اكتب اسم الطالب (حرفان على الأقل).' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_valid_username(u) THEN
    RAISE EXCEPTION 'invalid_username: اسم المستخدم غير صالح.' USING ERRCODE = '22023';
  END IF;
  IF public._is_reserved_username(u) THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم محجوز، اختر غيره.' USING ERRCODE = '23505';
  END IF;
  PERFORM public._check_new_password(_password);

  PERFORM public._auth_rate_hit('teacher_create', caller::text, 120, interval '1 hour');
  PERFORM public._auth_rate_hit('signup', '*', 300, interval '1 hour');

  mail := public.username_email(u);
  IF EXISTS (SELECT 1 FROM public.account_usernames WHERE username = u)
     OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = mail) THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم مستخدم من قبل، اختر غيره.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', mail,
    extensions.crypt(_password, extensions.gen_salt('bf', 10)), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                       'username_account', true, 'created_by_teacher', caller),
    jsonb_build_object('name', display_name, 'username', u),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_id, new_id::text, 'email',
    jsonb_build_object('sub', new_id::text, 'email', mail, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  INSERT INTO public.account_usernames (user_id, username) VALUES (new_id, u);
  code := public._rotate_recovery_code(new_id);

  INSERT INTO public.account_secrets (user_id, password_set_by, password_set_at, must_change_password, updated_at)
  VALUES (new_id, caller, now(), true, now())
  ON CONFLICT (user_id) DO UPDATE
    SET password_set_by = caller, password_set_at = now(), must_change_password = true, updated_at = now();
  INSERT INTO public.password_resets_audit (user_id, actor_id, method) VALUES (new_id, caller, 'teacher');

  INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES (_halaqa, new_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('student_id', new_id, 'username', u, 'name', display_name,
                            'recovery_code', code);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم مستخدم من قبل، اختر غيره.' USING ERRCODE = '23505';
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_create_student(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_create_student(uuid, text, text, text) TO authenticated;
