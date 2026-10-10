-- تدقيق أكتوبر 2026 — المرحلة 4.2: مفاتيح الميزات.
--
-- لإيقاف ميزة قليلة الاستعمال أو طرح ميزة جديدة تدريجياً دون إصدار جديد من المتجر. المفتاح يُخفي مدخل الميزة
-- من الواجهة؛ الحماية الأمنية تبقى في RLS والدوال لا هنا. مسار التقاعد في docs/SUSTAINABILITY.md.
--   enabled = false  ⇒ مخفية عن الجميع.
--   rollout = 0..100 ⇒ نسبة الحسابات التي تراها (توزيع ثابت لكل حساب: hash(key:user) في الواجهة).
-- المفتاح غير الموجود في الجدول = القيمة الافتراضية في الكود (src/lib/feature-flags.ts).

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean NOT NULL DEFAULT true,
  rollout integer NOT NULL DEFAULT 100 CHECK (rollout BETWEEN 0 AND 100),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

DROP POLICY IF EXISTS "flags readable by signed-in users" ON public.feature_flags;
CREATE POLICY "flags readable by signed-in users" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

-- الكتابة عبر الدالة وحدها، ولصاحب التطبيق وحده.
CREATE OR REPLACE FUNCTION public.set_feature_flag(
  _key text,
  _enabled boolean,
  _rollout integer DEFAULT 100,
  _note text DEFAULT NULL
) RETURNS public.feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.feature_flags;
BEGIN
  IF NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'not_allowed: لصاحب التطبيق فقط.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.feature_flags (key, enabled, rollout, note, updated_at)
  VALUES (_key, COALESCE(_enabled, true), COALESCE(_rollout, 100), NULLIF(btrim(_note), ''), now())
  ON CONFLICT (key) DO UPDATE
    SET enabled = EXCLUDED.enabled, rollout = EXCLUDED.rollout, note = EXCLUDED.note, updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.set_feature_flag(text, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text, boolean, integer, text) TO authenticated, service_role;
