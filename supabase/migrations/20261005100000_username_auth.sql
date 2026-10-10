-- ════════════════════════════════════════════════════════════════════
-- الدخول باسم مستخدم وكلمة مرور، بلا بريد ولا هاتف ولا خدمة رسائل مدفوعة
-- ════════════════════════════════════════════════════════════════════
-- Supabase Auth يعرف البريد وكلمة المرور فقط، فكل اسم مستخدم يُقابله «بريد داخلي» مشتق منه:
--   left(sha256('zen-username:' || الاسم الموحَّد), 32) || '@users.zen.invalid'
-- النطاق .invalid محجوز (RFC 2606) فلن يُرسَل إليه شيء، والحساب يُنشأ هنا مؤكَّداً، فلا يعتمد
-- التسجيل على إعداد «Confirm email» ولا على أي مزوّد بريد أو رسائل. الدخول بعدها عادي تماماً:
-- supabase.auth.signInWithPassword({ email: <البريد الداخلي>, password }).
--
-- استعادة كلمة المرور بلا بريد:
--   1) رمز استرداد يُعطى للمستخدم مرة واحدة عند التسجيل (يُحفظ مجزّأً bcrypt، ويتجدد بعد كل استخدام).
--   2) معلّم حلقة الطالب يعيّن له كلمة مرور جديدة (teacher_set_student_password).
-- كل الدوال SECURITY DEFINER بحدود معدَّل، وأخطاؤها عامة لا تكشف وجود الحسابات.
-- يُطابق حساب البريد الداخلي في العميل: src/lib/username.ts (usernameToEmail).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── 1) توحيد اسم المستخدم والتحقق منه (يطابق normalizeUsername/usernameError في العميل) ───
CREATE OR REPLACE FUNCTION public.normalize_username(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(btrim(
    translate(
      regexp_replace(
        normalize(coalesce(_raw, ''), NFKC),
        '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', 'g'
      ),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹أإآٱى',
      '01234567890123456789ااااي'
    )
  ))
$$;

CREATE OR REPLACE FUNCTION public.is_valid_username(_u text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT _u IS NOT NULL
     AND char_length(_u) BETWEEN 3 AND 24
     AND _u ~ '^[a-z\u0621-\u064A][a-z0-9_.\u0621-\u064A]*[a-z0-9_\u0621-\u064A]$'
     AND position('..' IN _u) = 0
$$;

CREATE OR REPLACE FUNCTION public.username_email(_u text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT left(encode(sha256(convert_to('zen-username:' || _u, 'UTF8')), 'hex'), 32)
         || '@users.zen.invalid'
$$;

-- ─── 2) الجداول ───
-- أسماء المستخدمين: كل مستخدم يقرأ اسمه فقط، والمعلّم يقرأ أسماء طلابه عبر دالة.
CREATE TABLE IF NOT EXISTS public.account_usernames (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (public.is_valid_username(username)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_usernames FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_usernames TO authenticated;
GRANT ALL ON public.account_usernames TO service_role;
DROP POLICY IF EXISTS "read own username" ON public.account_usernames;
CREATE POLICY "read own username" ON public.account_usernames
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- أسرار الحساب: لا يقرؤها أحد مباشرة إطلاقاً (لا سياسات ولا صلاحيات).
CREATE TABLE IF NOT EXISTS public.account_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_hash text,
  recovery_failures integer NOT NULL DEFAULT 0,
  recovery_locked_until timestamptz,
  -- عيّن المعلّم كلمة المرور ⇒ يُنبَّه الطالب لتغييرها بنفسه.
  password_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  password_set_at timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_secrets TO service_role;

-- سجل محاولات لحدود المعدّل (التسجيل والاسترداد وتعيين المعلّم).
CREATE TABLE IF NOT EXISTS public.auth_rate_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_rate_events_lookup_idx
  ON public.auth_rate_events (kind, key, created_at DESC);
ALTER TABLE public.auth_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_rate_events TO service_role;

-- سجل تدقيق: من عيّن كلمة مرور من ومتى.
CREATE TABLE IF NOT EXISTS public.password_resets_audit (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('teacher', 'recovery_code', 'self')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_audit_user_idx
  ON public.password_resets_audit (user_id, created_at DESC);
ALTER TABLE public.password_resets_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_resets_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.password_resets_audit TO service_role;

-- ─── 3) أدوات داخلية ───
-- عنوان IP الطالب كما يمرّره PostgREST (أول قيمة في x-forwarded-for).
CREATE OR REPLACE FUNCTION public._request_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  h text := current_setting('request.headers', true);
  ip text;
BEGIN
  IF h IS NULL OR h = '' THEN
    RETURN 'unknown';
  END IF;
  ip := btrim(split_part(coalesce(h::json ->> 'x-forwarded-for', h::json ->> 'x-real-ip', ''), ',', 1));
  RETURN coalesce(nullif(left(ip, 64), ''), 'unknown');
EXCEPTION WHEN others THEN
  RETURN 'unknown';
END;
$$;
REVOKE ALL ON FUNCTION public._request_ip() FROM PUBLIC, anon, authenticated;

-- يسجّل محاولة ويرفض إن تجاوز المفتاح الحد خلال النافذة.
CREATE OR REPLACE FUNCTION public._auth_rate_hit(_kind text, _key text, _max integer, _window interval)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.auth_rate_events
   WHERE kind = _kind AND key = _key AND created_at > now() - _window;
  IF n >= _max THEN
    RAISE EXCEPTION 'rate_limited: محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة.'
      USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO public.auth_rate_events (kind, key) VALUES (_kind, _key);
  -- تنظيف خفيف لما مضى عليه يوم.
  IF random() < 0.02 THEN
    DELETE FROM public.auth_rate_events WHERE created_at < now() - interval '1 day';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._auth_rate_hit(text, text, integer, interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._check_new_password(_password text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _password IS NULL OR char_length(_password) < 8 THEN
    RAISE EXCEPTION 'weak_password: كلمة المرور 8 أحرف على الأقل.' USING ERRCODE = '22023';
  END IF;
  -- bcrypt يقرأ أول 72 بايتاً فقط.
  IF octet_length(_password) > 72 THEN
    RAISE EXCEPTION 'weak_password: كلمة المرور طويلة جداً.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._check_new_password(text) FROM PUBLIC, anon, authenticated;

-- رمز استرداد عشوائي: 16 محرفاً من أبجدية لا تلتبس (بلا 0/O و1/I/L)، مجموعات من 4.
CREATE OR REPLACE FUNCTION public._new_recovery_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(16);
  out text := '';
  i integer;
BEGIN
  FOR i IN 0..15 LOOP
    IF i > 0 AND i % 4 = 0 THEN
      out := out || '-';
    END IF;
    out := out || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  END LOOP;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public._new_recovery_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._normalize_recovery_code(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
REVOKE ALL ON FUNCTION public._normalize_recovery_code(text) FROM PUBLIC, anon, authenticated;

-- يولّد رمزاً جديداً ويحفظ بصمته ويعيده (مرة واحدة فقط).
CREATE OR REPLACE FUNCTION public._rotate_recovery_code(_uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text := public._new_recovery_code();
BEGIN
  INSERT INTO public.account_secrets (user_id, recovery_hash, recovery_failures, recovery_locked_until, updated_at)
  VALUES (_uid, extensions.crypt(public._normalize_recovery_code(code), extensions.gen_salt('bf', 8)), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET recovery_hash = EXCLUDED.recovery_hash,
        recovery_failures = 0,
        recovery_locked_until = NULL,
        updated_at = now();
  RETURN code;
END;
$$;
REVOKE ALL ON FUNCTION public._rotate_recovery_code(uuid) FROM PUBLIC, anon, authenticated;

-- يغيّر كلمة المرور في Supabase Auth ويُنهي كل الجلسات القائمة (رموز التحديث).
CREATE OR REPLACE FUNCTION public._set_auth_password(_uid uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
     SET encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   WHERE id = _uid;
  DELETE FROM auth.refresh_tokens WHERE user_id = _uid::text;
  DELETE FROM auth.sessions WHERE user_id = _uid;
END;
$$;
REVOKE ALL ON FUNCTION public._set_auth_password(uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 4) التسجيل ───
-- ينشئ حساباً مؤكَّداً باسم مستخدم، ويعيد الاسم الموحَّد ورمز الاسترداد. العميل يدخل بعدها
-- بـ signInWithPassword. الدور دائماً «طالب» (handle_new_user)، والمعلم يُرقّى بدعوة كالسابق.
CREATE OR REPLACE FUNCTION public.register_username_account(
  _username text,
  _password text,
  _name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u text := public.normalize_username(_username);
  display_name text := left(btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')), 60);
  mail text;
  new_id uuid := gen_random_uuid();
  code text;
BEGIN
  IF NOT public.is_valid_username(u) THEN
    RAISE EXCEPTION 'invalid_username: اسم المستخدم غير صالح.' USING ERRCODE = '22023';
  END IF;
  IF u = ANY (ARRAY['admin', 'administrator', 'root', 'support', 'zen', 'zen_app', 'system',
                    'teacher', 'student', 'moderator', 'مدير', 'المدير', 'الدعم', 'زين', 'مشرف']) THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم محجوز، اختر غيره.' USING ERRCODE = '23505';
  END IF;
  PERFORM public._check_new_password(_password);

  -- حدود: 5 حسابات في الساعة لكل عنوان، و300 في الساعة للمشروع كله.
  PERFORM public._auth_rate_hit('signup', public._request_ip(), 5, interval '1 hour');
  PERFORM public._auth_rate_hit('signup', '*', 300, interval '1 hour');

  mail := public.username_email(u);
  IF EXISTS (SELECT 1 FROM public.account_usernames WHERE username = u)
     OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = mail) THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم مستخدم من قبل، اختر غيره.' USING ERRCODE = '23505';
  END IF;

  IF display_name = '' THEN
    display_name := u;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', mail,
    extensions.crypt(_password, extensions.gen_salt('bf', 10)), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'username_account', true),
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

  RETURN jsonb_build_object('username', u, 'recovery_code', code);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم مستخدم من قبل، اختر غيره.' USING ERRCODE = '23505';
END;
$$;
REVOKE ALL ON FUNCTION public.register_username_account(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_username_account(text, text, text) TO anon, authenticated;

-- ─── 5) الاسترداد برمز الاسترداد ───
-- يعيّن كلمة مرور جديدة، ويُنهي الجلسات القديمة، ويعيد رمز استرداد جديداً (القديم لا يعمل مرتين).
CREATE OR REPLACE FUNCTION public.reset_password_with_recovery_code(
  _username text,
  _code text,
  _new_password text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u text := public.normalize_username(_username);
  uid uuid;
  sec public.account_secrets;
  ok boolean := false;
BEGIN
  PERFORM public._check_new_password(_new_password);
  PERFORM public._auth_rate_hit('recovery', public._request_ip(), 10, interval '1 hour');

  SELECT user_id INTO uid FROM public.account_usernames WHERE username = u;
  IF uid IS NOT NULL THEN
    SELECT * INTO sec FROM public.account_secrets WHERE user_id = uid FOR UPDATE;
  END IF;

  IF sec.user_id IS NOT NULL AND sec.recovery_locked_until IS NOT NULL AND sec.recovery_locked_until > now() THEN
    RAISE EXCEPTION 'rate_limited: محاولات كثيرة لهذا الحساب، انتظر ساعة أو اطلب من معلّمك.'
      USING ERRCODE = 'P0429';
  END IF;

  IF sec.recovery_hash IS NOT NULL THEN
    ok := extensions.crypt(public._normalize_recovery_code(_code), sec.recovery_hash) = sec.recovery_hash;
  END IF;

  IF NOT ok THEN
    IF sec.user_id IS NOT NULL THEN
      UPDATE public.account_secrets
         SET recovery_failures = recovery_failures + 1,
             recovery_locked_until = CASE WHEN recovery_failures + 1 >= 5
                                          THEN now() + interval '1 hour' END,
             updated_at = now()
       WHERE user_id = uid;
    END IF;
    -- رسالة واحدة سواء كان الاسم غير موجود أو الرمز خاطئاً.
    RETURN jsonb_build_object('ok', false);
  END IF;

  PERFORM public._set_auth_password(uid, _new_password);
  UPDATE public.account_secrets
     SET must_change_password = false, password_set_by = NULL, password_set_at = now()
   WHERE user_id = uid;
  INSERT INTO public.password_resets_audit (user_id, actor_id, method) VALUES (uid, uid, 'recovery_code');

  RETURN jsonb_build_object('ok', true, 'username', u, 'recovery_code', public._rotate_recovery_code(uid));
END;
$$;
REVOKE ALL ON FUNCTION public.reset_password_with_recovery_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_password_with_recovery_code(text, text, text) TO anon, authenticated;

-- ─── 6) المعلّم يعيّن كلمة مرور لطالبه ───
-- المسموح: معلّم (user_roles) يُدرّس الطالب في إحدى حلقاته، والطالب ليس معلّماً (فلا يُستولى على
-- حساب معلّم آخر). تُنهى جلسات الطالب، ويُنبَّه لتغييرها عند دخوله، ويُسجَّل الإجراء.
CREATE OR REPLACE FUNCTION public.teacher_set_student_password(_student uuid, _new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  uname text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.' USING ERRCODE = '42501';
  END IF;
  IF _student IS NULL OR _student = caller
     OR NOT public.teaches_student(caller, _student)
     OR public.is_teacher(_student) THEN
    RAISE EXCEPTION 'not_allowed: تعيين كلمة المرور متاح لمعلّم حلقة الطالب فقط.' USING ERRCODE = '42501';
  END IF;
  PERFORM public._check_new_password(_new_password);
  PERFORM public._auth_rate_hit('teacher_reset', caller::text, 30, interval '1 hour');

  PERFORM public._set_auth_password(_student, _new_password);
  INSERT INTO public.account_secrets (user_id, password_set_by, password_set_at, must_change_password, updated_at)
  VALUES (_student, caller, now(), true, now())
  ON CONFLICT (user_id) DO UPDATE
    SET password_set_by = caller, password_set_at = now(), must_change_password = true, updated_at = now();
  INSERT INTO public.password_resets_audit (user_id, actor_id, method) VALUES (_student, caller, 'teacher');

  SELECT username INTO uname FROM public.account_usernames WHERE user_id = _student;
  RETURN jsonb_build_object('ok', true, 'username', uname);
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_set_student_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_set_student_password(uuid, text) TO authenticated;

-- اسم مستخدم الطالب لمعلّمه (ليخبره به عند تسليمه كلمة المرور).
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
    'password_set_at', (SELECT password_set_at FROM public.account_secrets WHERE user_id = _student)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.student_login_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_login_info(uuid) TO authenticated;

-- ─── 7) حساب المستخدم نفسه ───
CREATE OR REPLACE FUNCTION public.my_login_info()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'username', (SELECT username FROM public.account_usernames WHERE user_id = auth.uid()),
    'must_change_password',
      coalesce((SELECT must_change_password FROM public.account_secrets WHERE user_id = auth.uid()), false),
    'has_recovery_code',
      coalesce((SELECT recovery_hash IS NOT NULL FROM public.account_secrets WHERE user_id = auth.uid()), false)
  ) END
$$;
REVOKE ALL ON FUNCTION public.my_login_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_login_info() TO authenticated;

-- تغيير كلمة المرور بمعرفة الحالية (لا يعتمد على إعدادات إعادة المصادقة بالبريد في Supabase).
CREATE OR REPLACE FUNCTION public.change_my_password(_current text, _new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  hash text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.' USING ERRCODE = '42501';
  END IF;
  PERFORM public._check_new_password(_new_password);
  PERFORM public._auth_rate_hit('change_password', caller::text, 10, interval '1 hour');
  SELECT encrypted_password INTO hash FROM auth.users WHERE id = caller;
  IF coalesce(hash, '') = '' OR extensions.crypt(coalesce(_current, ''), hash) <> hash THEN
    RAISE EXCEPTION 'wrong_password: كلمة المرور الحالية غير صحيحة.' USING ERRCODE = '28P01';
  END IF;
  -- الجلسة الحالية تنتهي أيضاً؛ العميل يدخل من جديد بكلمة المرور الجديدة مباشرة.
  PERFORM public._set_auth_password(caller, _new_password);
  UPDATE public.account_secrets
     SET must_change_password = false, password_set_by = NULL, password_set_at = now(), updated_at = now()
   WHERE user_id = caller;
  INSERT INTO public.password_resets_audit (user_id, actor_id, method) VALUES (caller, caller, 'self');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.change_my_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_my_password(text, text) TO authenticated;

-- رمز استرداد جديد (يُبطل القديم) بعد التحقق من كلمة المرور.
CREATE OR REPLACE FUNCTION public.regenerate_recovery_code(_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  hash text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.' USING ERRCODE = '42501';
  END IF;
  PERFORM public._auth_rate_hit('change_password', caller::text, 10, interval '1 hour');
  SELECT encrypted_password INTO hash FROM auth.users WHERE id = caller;
  IF coalesce(hash, '') = '' OR extensions.crypt(coalesce(_password, ''), hash) <> hash THEN
    RAISE EXCEPTION 'wrong_password: كلمة المرور غير صحيحة.' USING ERRCODE = '28P01';
  END IF;
  RETURN public._rotate_recovery_code(caller);
END;
$$;
REVOKE ALL ON FUNCTION public.regenerate_recovery_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_recovery_code(text) TO authenticated;

-- حسابات قديمة (بريد أو هاتف): تختار اسم مستخدم وكلمة مرور فتدخل بهما من الآن.
-- البريد الحقيقي يُستبدل بالبريد الداخلي (فلا يبقى بريد محفوظ)، والرقم يبقى كما هو.
CREATE OR REPLACE FUNCTION public.claim_username(_username text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  u text := public.normalize_username(_username);
  mail text;
  hash text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_usernames WHERE user_id = caller) THEN
    RAISE EXCEPTION 'already_claimed: لديك اسم مستخدم بالفعل.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_valid_username(u) THEN
    RAISE EXCEPTION 'invalid_username: اسم المستخدم غير صالح.' USING ERRCODE = '22023';
  END IF;
  PERFORM public._check_new_password(_password);
  PERFORM public._auth_rate_hit('change_password', caller::text, 10, interval '1 hour');

  -- إن كانت للحساب كلمة مرور فيجب إثباتها (حماية جلسة مفتوحة على جهاز مشترك).
  SELECT encrypted_password INTO hash FROM auth.users WHERE id = caller;
  IF coalesce(hash, '') <> '' AND extensions.crypt(_password, hash) <> hash THEN
    RAISE EXCEPTION 'wrong_password: اكتب كلمة مرور حسابك الحالية.' USING ERRCODE = '28P01';
  END IF;

  mail := public.username_email(u);
  IF EXISTS (SELECT 1 FROM public.account_usernames WHERE username = u)
     OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = mail AND id <> caller) THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم مستخدم من قبل، اختر غيره.' USING ERRCODE = '23505';
  END IF;

  UPDATE auth.users
     SET email = mail,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         encrypted_password = CASE WHEN coalesce(hash, '') = ''
                                   THEN extensions.crypt(_password, extensions.gen_salt('bf', 10))
                                   ELSE encrypted_password END,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', u),
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('username_account', true),
         updated_at = now()
   WHERE id = caller;

  IF EXISTS (SELECT 1 FROM auth.identities WHERE user_id = caller AND provider = 'email') THEN
    UPDATE auth.identities
       SET identity_data = coalesce(identity_data, '{}'::jsonb)
                           || jsonb_build_object('email', mail, 'email_verified', true),
           updated_at = now()
     WHERE user_id = caller AND provider = 'email';
  ELSE
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), caller, caller::text, 'email',
            jsonb_build_object('sub', caller::text, 'email', mail, 'email_verified', true, 'phone_verified', false),
            now(), now());
  END IF;

  INSERT INTO public.account_usernames (user_id, username) VALUES (caller, u);
  RETURN jsonb_build_object('username', u, 'recovery_code', public._rotate_recovery_code(caller));
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username_taken: اسم المستخدم مستخدم من قبل، اختر غيره.' USING ERRCODE = '23505';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_username(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_username(text, text) TO authenticated;

COMMENT ON TABLE public.account_usernames IS
  'اسم المستخدم للدخول بلا بريد ولا هاتف؛ البريد الداخلي = public.username_email(username).';
