-- ═══════════════════════════════════════════════════════════════════════════
-- رمز المؤسس داخل التطبيق
--
-- المشكلة: رمز المؤسس لا يظهر إلا في جدول founder_codes في لوحة قاعدة البيانات، وهذا صعب على
-- صاحب التطبيق.
--
-- الحل: يرى صاحب التطبيق وحده رمز المؤسس داخل شاشة «أنا معلّم» ويفعّل دوره بلمسة.
--   • صاحب التطبيق = الحساب المحدَّد في app_owner إن وُجد، وإلا أقدم حساب حقيقي (غير ضيف) في
--     التطبيق، وهو عادةً حساب المطوّر الذي أنشأه أولاً.
--   • founder_code_for_me(): تعيد رمزاً صالحاً غير مستخدَم لصاحب التطبيق فقط (وتُصدر واحداً إن
--     لم يوجد)، ولا تكشف شيئاً لغيره. بعد تفعيل دوره تعيد 'already' ولا تعرض رمزاً.
--   • لتغيير صاحب التطبيق (إن كان أقدم حساب حساب تجربة):
--       INSERT INTO public.app_owner (id, user_id) VALUES (true, '<uuid>')
--       ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id;
-- يعتمد على 20261006100000_founder_code.sql (يجب تطبيقه قبله).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_owner (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),  -- صف واحد فقط
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_owner IS
  'صاحب التطبيق (صف واحد). اختياري: إن كان فارغاً فصاحب التطبيق هو أقدم حساب حقيقي.';
ALTER TABLE public.app_owner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_owner FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_owner TO service_role;

CREATE OR REPLACE FUNCTION public.app_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT user_id FROM public.app_owner WHERE id),
    (SELECT u.id FROM auth.users u
      WHERE COALESCE(u.is_anonymous, false) = false
      ORDER BY u.created_at ASC, u.id ASC
      LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public.app_owner_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_owner_id() TO service_role;

-- الحالات: {status:'owner', code} | {status:'already'} | {status:'not_owner'}
CREATE OR REPLACE FUNCTION public.founder_code_for_me()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  c text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;

  IF public.has_role(caller, 'teacher') THEN
    RETURN jsonb_build_object('status', 'already');
  END IF;

  IF caller IS DISTINCT FROM public.app_owner_id() THEN
    RETURN jsonb_build_object('status', 'not_owner');
  END IF;

  SELECT code INTO c FROM public.founder_codes
   WHERE used_by IS NULL AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at ASC
   LIMIT 1;

  IF c IS NULL THEN
    c := public.issue_founder_code('صدر تلقائياً لصاحب التطبيق من داخل التطبيق', NULL);
  END IF;

  RETURN jsonb_build_object('status', 'owner', 'code', c);
END;
$$;
REVOKE ALL ON FUNCTION public.founder_code_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.founder_code_for_me() TO authenticated;
