-- ════════════════════════════════════════════════════════════════════
-- تحليل قسم «المزيد» (SEC-04): فحص حذف الحساب قبل حذف ملفاته.
--
-- Supabase لا يسمح بحذف كائنات التخزين من SQL، فالعميل يحذف الملفات ثم يستدعي
-- delete_my_account. إن رفضت الدالة (مالك وحيد لمركز فيه آخرون، أو عبارة خاطئة)
-- كان الحساب يبقى بلا تسجيلاته ومرفقاته. delete_my_account_check يُجري الفحوص نفسها
-- دون أن يحذف شيئاً، فيستدعيه العميل أولاً ولا يمسّ الملفات إلا إن نجح.
-- delete_my_account تبقى كما هي وتعيد الفحص (الخادم هو الحَكَم دائماً).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_my_account_check(_confirm text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولاً.'; END IF;
  IF _confirm IS DISTINCT FROM 'احذف حسابي' THEN
    RAISE EXCEPTION 'اكتب «احذف حسابي» للتأكيد.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.center_staff s
    WHERE s.user_id = _uid AND s.role = 'manager'
      AND NOT EXISTS (SELECT 1 FROM public.center_staff o
                      WHERE o.center_id = s.center_id AND o.role = 'manager' AND o.user_id <> _uid)
      AND (EXISTS (SELECT 1 FROM public.center_staff o WHERE o.center_id = s.center_id AND o.user_id <> _uid)
           OR EXISTS (SELECT 1 FROM public.halaqat h WHERE h.center_id = s.center_id AND h.teacher_id IS DISTINCT FROM _uid))
  ) THEN
    RAISE EXCEPTION 'أنت المالك الوحيد لمركز فيه أعضاء آخرون. أضف مالكاً آخر أو احذف المركز أولاً.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account_check(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account_check(text) TO authenticated;
