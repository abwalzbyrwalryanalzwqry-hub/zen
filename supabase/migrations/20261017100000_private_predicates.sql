-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 7.2 — مخطّط private لدوال شروط السياسات
-- ════════════════════════════════════════════════════════════════════════════
-- دوال الشروط (SECURITY DEFINER) التي تستعملها سياسات RLS كانت في public، فيمكن طلبها عبر /rest/v1/rpc
-- ويعدّها مستشار الأمان. المخطّط private غير معروض في واجهة API (PostgREST يعرض public فقط)، لكن الدورين
-- anon وauthenticated يحتاجان USAGE عليه لأن السياسة تُقيَّم بدور المستخدم.
--   1) نسخة مطابقة حرفياً من كل دالة في private (من pg_get_functiondef).
--   2) كل سياسة (public وstorage) تستدعي النسخة في private.
--   3) الدوال التي تعمل بصلاحية المستدعي وتستدعيها (recitation_sessions_guard) تستدعي private أيضاً.
--   4) نسخ public تبقى للدوال الأخرى التي تعمل بصلاحية المالك، لكن تُسحب صلاحية تنفيذها من anon
--      وauthenticated. ما تناديه الواجهة فعلاً (can_post_in_chat) يبقى في public.
-- لا تغيير في منطق أي شرط. يحرس ذلك الفحص 96.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
-- لا تُمنح دوال private الجديدة لأحد تلقائياً إلا بما يلي صراحة.
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TEMP TABLE _pp (name text PRIMARY KEY, client_rpc boolean NOT NULL) ON COMMIT DROP;
INSERT INTO _pp VALUES
  ('can_manage_schedule', false), ('can_post_in_chat', true), ('can_read_chat', false),
  ('can_read_room', false), ('can_start_chat', false), ('can_view_center', false),
  ('can_view_schedule', false), ('is_guardian_of', false), ('is_teacher', false),
  ('manages_halaqa', false), ('owns_center', false), ('supervises_chat', false),
  ('teaches_student', false);

DO $$
DECLARE
  r record;
  def text;
  pat text := (SELECT string_agg(name, '|') FROM _pp);
  q text;
  c text;
  roles text;
BEGIN
  -- 1) النسخ في private.
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (SELECT name FROM _pp)
  LOOP
    def := pg_get_functiondef(r.oid);
    def := regexp_replace(def, '^CREATE OR REPLACE FUNCTION public\.', 'CREATE OR REPLACE FUNCTION private.');
    EXECUTE def;
    EXECUTE format('REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC', r.proname,
                   pg_get_function_identity_arguments(r.oid));
    EXECUTE format('GRANT EXECUTE ON FUNCTION private.%I(%s) TO anon, authenticated, service_role',
                   r.proname, pg_get_function_identity_arguments(r.oid));
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
    -- لا نمسّ اسم الدالة نفسها في رأس التعريف.
    EXECUTE def;
  END LOOP;

  -- 4) نسخ public: لا تنفيذ للعميل إلا ما تناديه الواجهة.
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (SELECT name FROM _pp WHERE NOT client_rpc)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, pg_get_function_identity_arguments(r.oid));
  END LOOP;
END $$;
