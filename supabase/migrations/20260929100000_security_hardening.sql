-- ════════════════════════════════════════════════════════════════════════════
-- تقوية أمنية صغيرة — ملاحظات مستشار الأمان في Supabase (27 سبتمبر 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- 1) دوال المحادثات الأربع (SECURITY DEFINER) كانت قابلة للتنفيذ من الدور anon عبر
--    /rest/v1/rpc: الترحيلات السابقة سحبت الصلاحية من PUBLIC فقط، لكن Supabase يمنح
--    anon صلاحية التنفيذ مباشرة بالامتيازات الافتراضية. لا يحتاجها زائر غير مسجّل.
-- 2) دالتان بلا search_path ثابت. كلتاهما IMMUTABLE ولا تستعملان إلا دوال pg_catalog،
--    فالمسار الفارغ آمن ولا يغيّر سلوكهما.
-- لا تغيير في منطق أي دالة، ولا في سياسات RLS.

REVOKE EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_chat_seen(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unread_counts() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unread_total() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_chat_seen(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unread_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unread_total() TO authenticated, service_role;

ALTER FUNCTION public.storage_folder_uuid(text) SET search_path = '';
ALTER FUNCTION public.sm2_quality(integer) SET search_path = '';
