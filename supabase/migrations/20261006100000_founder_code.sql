-- ═══════════════════════════════════════════════════════════════════════════
-- «أنا معلّم» + رمز المؤسس
--
-- المشكلة: دور المعلم يُمنح فقط برمز دعوة يُصدره معلّم قائم، فلا يستطيع أول معلّم في مشروع
-- جديد تفعيل دوره من داخل التطبيق (كان الحل الوحيد أمر SQL يدوياً).
--
-- الحل:
--   • founder_codes: رموز مؤسس يملكها صاحب التطبيق وحده. لا يقرؤها العميل إطلاقاً (لا سياسات
--     ولا صلاحيات)، وتظهر لصاحب المشروع في محرر الجداول في لوحة Supabase / Lovable Cloud.
--     يُولَّد رمز أول تلقائياً مع هذا الترحيل. كل رمز لمرة واحدة.
--   • activate_teacher_role(_code): مدخل واحد لشاشة «أنا معلّم» يقبل رمز دعوة معلّم أو رمز
--     مؤسس، مع قفل بعد 5 محاولات خاطئة لساعة (لا تخمين). لا يرمي أخطاء للحالات المتوقّعة بل
--     يعيد حالة نصية، كي لا يُلغى تسجيل المحاولة الخاطئة بالتراجع.
--   • issue_founder_code(): لصاحب المشروع فقط (service_role / محرر SQL) لإصدار رمز جديد.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.founder_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- بالشكل المعروض: ZEN-XXXXX-XXXXX-XXXXX-XXXXX (سُداسي عشري، 80 بتاً عشوائياً).
  code text NOT NULL UNIQUE,
  note text,
  expires_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.founder_codes IS
  'رموز المؤسس لتفعيل أول معلّم/مدير من شاشة «أنا معلّم». كل رمز لمرة واحدة. أصدر رمزاً جديداً: SELECT public.issue_founder_code();';
ALTER TABLE public.founder_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.founder_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.founder_codes TO service_role;

-- قفل المحاولات الخاطئة لكل حساب.
CREATE TABLE IF NOT EXISTS public.teacher_code_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_code_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.teacher_code_attempts TO service_role;

-- توحيد الرمز: حروف وأرقام فقط، بأحرف كبيرة (يقبل المسافات والشرطات والأحرف الصغيرة).
CREATE OR REPLACE FUNCTION public.normalize_role_code(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(regexp_replace(COALESCE(_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- إصدار رمز مؤسس جديد (لصاحب المشروع فقط).
CREATE OR REPLACE FUNCTION public.issue_founder_code(_note text DEFAULT NULL, _valid_days integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h text;
  new_code text;
  attempt integer;
BEGIN
  FOR attempt IN 1..5 LOOP
    h := upper(left(replace(gen_random_uuid()::text, '-', ''), 20));
    new_code := 'ZEN-' || substr(h, 1, 5) || '-' || substr(h, 6, 5) || '-' || substr(h, 11, 5) || '-' || substr(h, 16, 5);
    BEGIN
      INSERT INTO public.founder_codes (code, note, expires_at)
      VALUES (
        new_code,
        NULLIF(btrim(COALESCE(_note, '')), ''),
        CASE WHEN _valid_days IS NULL THEN NULL ELSE now() + make_interval(days => _valid_days) END
      );
      RETURN new_code;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'تعذّر توليد رمز فريد، حاول مرة أخرى.';
END;
$$;
REVOKE ALL ON FUNCTION public.issue_founder_code(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_founder_code(text, integer) TO service_role;

-- الرمز الأول: يُولَّد مرة واحدة فقط (إن لم يوجد أي رمز مؤسس بعد).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.founder_codes) THEN
    PERFORM public.issue_founder_code('الرمز الأول — لتفعيل مؤسس التطبيق', NULL);
  END IF;
END;
$$;

-- «أنا معلّم»: رمز دعوة أو رمز مؤسس.
-- الحالات: invite | founder | already | invalid | used | expired | locked
CREATE OR REPLACE FUNCTION public.activate_teacher_role(_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  norm text := public.normalize_role_code(_code);
  att public.teacher_code_attempts;
  inv public.teacher_invites;
  fc public.founder_codes;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;

  IF public.has_role(caller, 'teacher') THEN
    RETURN 'already';
  END IF;

  SELECT * INTO att FROM public.teacher_code_attempts WHERE user_id = caller FOR UPDATE;
  IF att.locked_until IS NOT NULL AND att.locked_until > now() THEN
    RETURN 'locked';
  END IF;

  IF length(norm) >= 4 THEN
    -- 1) رمز دعوة من معلّم (10 محارف).
    SELECT * INTO inv FROM public.teacher_invites WHERE code = norm FOR UPDATE;
    IF inv.id IS NOT NULL THEN
      IF inv.used_by IS NOT NULL THEN RETURN 'used'; END IF;
      IF inv.expires_at < now() THEN RETURN 'expired'; END IF;
      INSERT INTO public.user_roles (user_id, role) VALUES (caller, 'teacher')
        ON CONFLICT (user_id, role) DO NOTHING;
      UPDATE public.teacher_invites SET used_by = caller, used_at = now() WHERE id = inv.id;
      DELETE FROM public.teacher_code_attempts WHERE user_id = caller;
      RETURN 'invite';
    END IF;

    -- 2) رمز مؤسس (يقبل كتابته دون البادئة ZEN).
    SELECT * INTO fc FROM public.founder_codes
     WHERE public.normalize_role_code(code) IN (norm, 'ZEN' || norm)
     FOR UPDATE;
    IF fc.id IS NOT NULL THEN
      IF fc.used_by IS NOT NULL THEN RETURN 'used'; END IF;
      IF fc.expires_at IS NOT NULL AND fc.expires_at < now() THEN RETURN 'expired'; END IF;
      INSERT INTO public.user_roles (user_id, role) VALUES (caller, 'teacher')
        ON CONFLICT (user_id, role) DO NOTHING;
      UPDATE public.founder_codes SET used_by = caller, used_at = now() WHERE id = fc.id;
      DELETE FROM public.teacher_code_attempts WHERE user_id = caller;
      RETURN 'founder';
    END IF;
  END IF;

  -- رمز خاطئ: تُحتسب المحاولة، ويُقفل الحساب ساعةً بعد 5 محاولات.
  INSERT INTO public.teacher_code_attempts (user_id, failures, locked_until, updated_at)
  VALUES (caller, 1, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET failures = CASE
          WHEN public.teacher_code_attempts.locked_until IS NOT NULL THEN 1  -- انتهى قفل سابق
          ELSE public.teacher_code_attempts.failures + 1
        END,
        locked_until = CASE
          WHEN public.teacher_code_attempts.locked_until IS NULL
               AND public.teacher_code_attempts.failures + 1 >= 5
          THEN now() + interval '1 hour'
          ELSE NULL
        END,
        updated_at = now();
  RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_teacher_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_teacher_role(text) TO authenticated;
