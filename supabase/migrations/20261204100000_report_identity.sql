-- ════════════════════════════════════════════════════════════════════════════
-- هوية التقرير على مستوى المركز (الإصدار 1.15.0) — docs/REPORTS.md
-- ════════════════════════════════════════════════════════════════════════════
-- الألوان والشعار والترويسة والتذييل والتقويم والأرقام تُضبط مرة واحدة للمركز، فتظهر بنفسها في كل
-- حلقاته وعلى كل جهاز، بدل أن تُحفظ على جهاز المعلّم وحده (localStorage) فتضيع عند تبديله.
-- القراءة: مدير الحلقة أو طاقم مركزها. الكتابة: منشئ المركز أو طاقمه فقط (لا يغيّر معلّم حلقة واحدة
-- هوية المركز كله)؛ ومن لا يملكها يبقى تعديله على جهازه كما قبل.
-- الحدود: كائن JSON حتى 400 كيلوبايت (الشعار مصغّر على الجهاز إلى 512 بكسل).
-- التراجع: DROP FUNCTION public.report_identity(uuid); DROP FUNCTION public.set_report_identity(uuid, jsonb);
--          ALTER TABLE public.centers DROP COLUMN report_identity;
-- الفحص: supabase/tests/checks.sql (147).

ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS report_identity jsonb;
ALTER TABLE public.centers DROP CONSTRAINT IF EXISTS centers_report_identity_check;
ALTER TABLE public.centers ADD CONSTRAINT centers_report_identity_check CHECK (
  report_identity IS NULL
  OR (jsonb_typeof(report_identity) = 'object' AND pg_column_size(report_identity) <= 400000)
);

CREATE OR REPLACE FUNCTION public.report_identity(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL
     OR (NOT private.manages_halaqa(caller, _halaqa) AND NOT private.can_view_center(caller, h.center_id)) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  RETURN jsonb_build_object(
    'identity', (SELECT c.report_identity FROM public.centers c WHERE c.id = h.center_id),
    'can_edit', private.can_view_center(caller, h.center_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_report_identity(_halaqa uuid, _identity jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL OR NOT private.can_view_center(caller, h.center_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _identity IS NOT NULL
     AND (jsonb_typeof(_identity) <> 'object' OR pg_column_size(_identity) > 400000) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;
  UPDATE public.centers SET report_identity = _identity, updated_at = now() WHERE id = h.center_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_identity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_report_identity(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_identity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_report_identity(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.report_identity IS
  'هوية تقارير مركز الحلقة {identity, can_edit}: لمدير الحلقة أو طاقم المركز.';
COMMENT ON FUNCTION public.set_report_identity IS
  'يحفظ هوية تقارير مركز الحلقة (منشئ المركز أو طاقمه فقط)؛ null يمسحها.';
