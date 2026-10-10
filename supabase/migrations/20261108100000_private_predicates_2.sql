-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 7.2 (تكملة) — نقل بقية دوال الشروط الداخلية إلى private
-- ════════════════════════════════════════════════════════════════════════════
-- مستشار الأمان (authenticated_security_definer_function_executable) أظهر دوال شروط داخلية ما زالت في
-- public وتقبل معرّف أي مستخدم، فيستطيع أي حساب مسجّل أن يسأل عبر /rest/v1/rpc عن دور مستخدم آخر أو
-- علاقاته (has_role وis_chat_participant وare_classmates وroom_role…). لا تناديها الواجهة ولا دوال Edge
-- عبر rpc، بل تستعملها سياسات RLS والدوال الأخرى فقط.
-- الطريقة نفسها في 20261017100000_private_predicates:
--   1) نسخة مطابقة حرفياً في private (من pg_get_functiondef) بصلاحيات التنفيذ نفسها التي كانت لنسخة public؛
--      لأن السياسة تُقيَّم بدور المستخدم.
--   2) كل سياسة (public وstorage) تستدعي نسخة private.
--   3) الدوال التي تعمل بصلاحية المستدعي (SECURITY INVOKER) وتستدعيها تستدعي private.
--   4) نسخ public تبقى لدوال المالك (SECURITY DEFINER) وservice_role، وتُسحب صلاحية تنفيذها من anon وauthenticated.
-- لا تغيير في منطق أي شرط. يحرس ذلك الفحص 118.
-- ملاحظة للمستقبل: أي تعديل لاحق لإحدى هذه الدوال يُطبَّق على النسختين (public وprivate) معاً.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE TEMP TABLE _pp2 (name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _pp2 VALUES
  ('are_classmates'), ('are_dm_classmates'), ('can_view_student_report'), ('guardian_meets_teacher'),
  ('has_role'), ('is_blocked_between'), ('is_chat_participant'), ('is_halaqa_member'),
  ('is_room_moderator'), ('is_student_pair_chat'), ('manages_center'), ('room_role'),
  ('teachers_share_center');

DO $$
DECLARE
  r record;
  def text;
  pat text := (SELECT string_agg(name, '|') FROM _pp2);
  q text;
  c text;
  roles text;
BEGIN
  -- 1) النسخ في private.
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (SELECT name FROM _pp2)
  LOOP
    def := pg_get_functiondef(r.oid);
    def := regexp_replace(def, '^CREATE OR REPLACE FUNCTION public\.', 'CREATE OR REPLACE FUNCTION private.');
    EXECUTE def;
    EXECUTE format('REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC', r.proname,
                   pg_get_function_identity_arguments(r.oid));
    -- الصلاحيات نفسها التي كانت لنسخة public (مثلاً is_chat_participant بلا anon منذ 20260929100000).
    SELECT string_agg(rl, ', ') INTO roles
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS rl
     WHERE has_function_privilege(rl, r.oid, 'EXECUTE');
    IF roles IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION private.%I(%s) TO %s',
                     r.proname, pg_get_function_identity_arguments(r.oid), roles);
    END IF;
  END LOOP;

  -- 2) السياسات.
  FOR r IN
    SELECT pol.polname, c2.relname, n2.nspname, pol.polcmd, pol.polpermissive, pol.polroles,
           pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS wc
      FROM pg_policy pol
      JOIN pg_class c2 ON c2.oid = pol.polrelid
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
     WHERE n2.nspname IN ('public', 'storage')
       AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
            coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ ('(^|[^.a-z_])(public\.)?(' || pat || ')\(')
  LOOP
    q := regexp_replace(r.qual, '(^|[^.a-z_])(public\.)?(' || pat || ')\(', '\1private.\3(', 'g');
    c := regexp_replace(r.wc, '(^|[^.a-z_])(public\.)?(' || pat || ')\(', '\1private.\3(', 'g');
    SELECT CASE WHEN r.polroles = '{0}' THEN 'public'
                ELSE string_agg(quote_ident(rolname), ', ') END
      INTO roles FROM pg_roles WHERE oid = ANY (r.polroles);
    IF roles IS NULL THEN roles := 'public'; END IF;
    EXECUTE format('DROP POLICY %I ON %I.%I', r.polname, r.nspname, r.relname);
    EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      r.polname, r.nspname, r.relname,
      CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      CASE r.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                    WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
      roles,
      CASE WHEN q IS NOT NULL THEN ' USING (' || q || ')' ELSE '' END,
      CASE WHEN c IS NOT NULL THEN ' WITH CHECK (' || c || ')' ELSE '' END);
  END LOOP;

  -- 3) الدوال بصلاحية المستدعي التي تستدعي الشروط.
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT p.prosecdef
       AND p.prosrc ~ ('(^|[^.a-z_])(public\.)?(' || pat || ')\(')
  LOOP
    def := pg_get_functiondef(r.oid);
    def := regexp_replace(def, '([^.a-z_])(public\.)?(' || pat || ')\(', '\1private.\3(', 'g');
    EXECUTE def;
  END LOOP;

  -- 4) نسخ public: لا تنفيذ للعميل.
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (SELECT name FROM _pp2)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, pg_get_function_identity_arguments(r.oid));
  END LOOP;
END $$;
