-- تدقيق أكتوبر 2026 — المرحلة 3.1: كلمات المرور الشائعة مرفوضة على الخادم، وحارس مخطط auth.
--
-- 1) private.common_passwords: قائمة كلمات مرور شائعة تحقّق قاعدة «8 أحرف وحرف ورقم» ومع ذلك تُخمَّن أولاً.
--    _check_new_password (كل مسارات التعيين: التسجيل، الاسترداد، المعلّم، التغيير) يرفضها. القائمة نفسها
--    حرفياً في src/lib/common-passwords.ts (اختبار يحرس التطابق).
-- 2) auth_schema_guard(): التسجيل ينشئ صفوف auth.users وauth.identities مباشرة (docs/decisions/0001).
--    إن أضاف Supabase Auth عموداً إلزامياً بلا قيمة افتراضية لا نكتبه، يتعطّل التسجيل بصمت؛ هذه الدالة تكشفه
--    في النسخ الاحتياطي اليومي قبل أن يكتشفه مستخدم.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.common_passwords (pw text PRIMARY KEY);
REVOKE ALL ON private.common_passwords FROM PUBLIC, anon, authenticated;
TRUNCATE private.common_passwords;
INSERT INTO private.common_passwords (pw) VALUES
  ('1a2b3c4d'),
  ('1q2w3e4r'),
  ('1q2w3e4r5t'),
  ('1qaz2wsx'),
  ('a1234567'),
  ('a12345678'),
  ('a123456789'),
  ('aa123456'),
  ('abc12345'),
  ('abc123456'),
  ('abcd1234'),
  ('abcde12345'),
  ('admin123'),
  ('admin1234'),
  ('ahmed123'),
  ('ali12345'),
  ('allah123'),
  ('android1'),
  ('asdf1234'),
  ('baseball1'),
  ('computer1'),
  ('dragon123'),
  ('football1'),
  ('freedom1'),
  ('google123'),
  ('hello123'),
  ('hello1234'),
  ('iloveyou1'),
  ('internet1'),
  ('iphone123'),
  ('islam123'),
  ('letmein1'),
  ('love1234'),
  ('master123'),
  ('mohammed1'),
  ('monkey123'),
  ('muhammad1'),
  ('p@ssw0rd'),
  ('p@ssword1'),
  ('passw0rd'),
  ('password1'),
  ('password12'),
  ('password123'),
  ('princess1'),
  ('q1w2e3r4'),
  ('q1w2e3r4t5'),
  ('qwe123456'),
  ('qwer1234'),
  ('qwerty12'),
  ('qwerty123'),
  ('quran123'),
  ('samsung1'),
  ('sanaa123'),
  ('secret123'),
  ('student1'),
  ('sunshine1'),
  ('teacher1'),
  ('test1234'),
  ('user1234'),
  ('welcome1'),
  ('yemen123'),
  ('yemen2024'),
  ('yemen2025'),
  ('yemen2026'),
  ('zaq12wsx'),
  ('zen12345'),
  ('zxcv1234'),
  ('احمد1234'),
  ('اسلام123'),
  ('محمد1234'),
  ('ضصثق1234');

CREATE OR REPLACE FUNCTION public._check_new_password(_password text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  IF EXISTS (SELECT 1 FROM private.common_passwords WHERE pw = lower(_password)) THEN
    RAISE EXCEPTION 'weak_password: كلمة المرور شائعة وسهلة التخمين، اختر غيرها.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._check_new_password(text) FROM PUBLIC, anon, authenticated;

-- الأعمدة التي تكتبها دوال التسجيل (20261005100000 و20261013100000). أي عمود إلزامي آخر بلا قيمة افتراضية خطر.
CREATE OR REPLACE FUNCTION public.auth_schema_guard()
RETURNS TABLE (table_name text, column_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- pg_catalog لا information_schema: الأخيرة تخفي أعمدة جداول لا يملك المستدعي صلاحية عليها.
  SELECT c.relname::text, a.attname::text
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'auth'
     AND c.relname IN ('users', 'identities')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attnotnull AND NOT a.atthasdef
     AND a.attgenerated = '' AND a.attidentity = ''
     AND ((c.relname = 'users' AND a.attname NOT IN (
            'instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at',
            'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at',
            'confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change'))
       OR (c.relname = 'identities' AND a.attname NOT IN (
            'id', 'user_id', 'provider_id', 'provider', 'identity_data', 'last_sign_in_at',
            'created_at', 'updated_at')))
   ORDER BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public.auth_schema_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_schema_guard() TO service_role;
