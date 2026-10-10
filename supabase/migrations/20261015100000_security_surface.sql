-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 7.1 — تقليص سطح الهجوم
-- ════════════════════════════════════════════════════════════════════════════
-- 1) دوال المشغّلات لا تُنادى من العميل أبداً، لكن Supabase يمنح anon وauthenticated صلاحية تنفيذ كل
--    دالة جديدة في public، فتظهر خمس منها (SECURITY DEFINER) في مستشار الأمان ويمكن طلبها عبر
--    /rest/v1/rpc. المشغّل لا يحتاج صلاحية EXECUTE لدى المستخدم ليعمل، فتُسحب من كل دوال المشغّلات
--    في public (الحالية كلها، لا الخمس فقط)، ويحرس الفحص 94 أي دالة مشغّل جديدة.
-- 2) `_request_ip()` يقدّم `cf-connecting-ip` (يضعه وكيل Supabase ولا يستطيع العميل تزويره) على أول قيمة
--    في `x-forwarded-for` التي يرسلها العميل نفسه، فلا يُتجاوز حدّ المعدّل بتغيير الترويسة.
-- لا تغيير في منطق أي دالة أخرى ولا في سياسات RLS. الدوال الثلاث المفتوحة لـ anon عمداً موثَّقة في
-- docs/security-setup.md (§ «ما يبقى مفتوحاً لـ anon»).

DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._request_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  h text := current_setting('request.headers', true);
  j json;
  ip text;
BEGIN
  IF h IS NULL OR h = '' THEN
    RETURN 'unknown';
  END IF;
  j := h::json;
  ip := btrim(coalesce(
    nullif(j ->> 'cf-connecting-ip', ''),
    nullif(j ->> 'x-real-ip', ''),
    split_part(coalesce(j ->> 'x-forwarded-for', ''), ',', 1)
  ));
  RETURN coalesce(nullif(left(ip, 64), ''), 'unknown');
EXCEPTION WHEN others THEN
  RETURN 'unknown';
END;
$$;
REVOKE ALL ON FUNCTION public._request_ip() FROM PUBLIC, anon, authenticated;
