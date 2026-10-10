-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 10.2 — الشهادات القابلة للتحقق
-- ════════════════════════════════════════════════════════════════════════════
-- لكل شهادة رمز تحقق من 16 حرفاً (64 بت، بلا حروف ملتبسة) يُطبع على الشهادة نصاً وQR.
-- verify_certificate(code) لأي مستخدم مسجّل في التطبيق (مركز آخر، وليّ أمر...) بحدّ 10 محاولات
-- في الدقيقة، ويعيد للمعتمدة فقط: الاسم والجزء والحلقة والمركز والمعلّم وتاريخ الاعتماد — لا
-- معرّفات ولا شيء من سجل الطالب. الشهادة غير المعتمدة أو المرفوضة = «غير صالحة».

CREATE OR REPLACE FUNCTION private.new_verify_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '' ORDER BY i)
    FROM (SELECT extensions.gen_random_bytes(16) AS b) x, generate_series(0, 15) AS i
$$;
REVOKE ALL ON FUNCTION private.new_verify_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.new_verify_code() TO service_role;

ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS verify_code text;
UPDATE public.certificates SET verify_code = private.new_verify_code() WHERE verify_code IS NULL;
ALTER TABLE public.certificates ALTER COLUMN verify_code SET DEFAULT private.new_verify_code();
ALTER TABLE public.certificates ALTER COLUMN verify_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS certificates_verify_code_key ON public.certificates (verify_code);
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_verify_code_format;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_verify_code_format
  CHECK (verify_code ~ '^[A-HJ-NP-Z2-9]{16}$');

CREATE TABLE IF NOT EXISTS public.certificate_verify_attempts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  found boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificate_verify_attempts_user_at ON public.certificate_verify_attempts (user_id, at DESC);
ALTER TABLE public.certificate_verify_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_verify_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_verify_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.certificate_verify_attempts_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.verify_certificate(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  code text := upper(regexp_replace(COALESCE(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c public.certificates%ROWTYPE;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  -- حالة لا استثناء: الاستثناء يلغي تسجيل المحاولة فيسقط الحدّ.
  IF (SELECT count(*) FROM public.certificate_verify_attempts
       WHERE user_id = caller AND at > now() - interval '1 minute') >= 10 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  DELETE FROM public.certificate_verify_attempts WHERE at < now() - interval '1 day';

  IF code ~ '^[A-HJ-NP-Z2-9]{16}$' THEN
    SELECT * INTO c FROM public.certificates WHERE verify_code = code AND status = 'approved';
  END IF;
  INSERT INTO public.certificate_verify_attempts (user_id, found) VALUES (caller, c.id IS NOT NULL);
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  RETURN jsonb_build_object(
    'status', 'valid', 'student_name', c.student_name, 'juz', c.juz,
    'halaqa_name', c.halaqa_name, 'center_name', c.center_name, 'teacher_name', c.teacher_name,
    'decided_at', c.decided_at, 'serial', c.serial);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_achievements(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.can_view_student_report(me, _student) THEN
    RAISE EXCEPTION 'لا تملك عرض إنجازات هذا الطالب.';
  END IF;
  RETURN jsonb_build_object(
    'student', (SELECT jsonb_build_object('id', id, 'name', name) FROM public.profiles WHERE id = _student),
    'streak', public.streak_of(_student),
    'memorized_pages', (SELECT count(DISTINCT page) FROM public.mushaf_records
                         WHERE student_id = _student AND kind = 'memorize'),
    'memorized', COALESCE((SELECT jsonb_agg(DISTINCT page) FROM public.mushaf_records
                            WHERE student_id = _student AND kind = 'memorize'), '[]'::jsonb),
    'badges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'kind', kind, 'no', no, 'label', public.unit_label(kind, no), 'earned_at', earned_at)
                 ORDER BY earned_at DESC, kind, no)
               FROM public.student_badges WHERE student_id = _student), '[]'::jsonb),
    'certificates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', id, 'juz', juz, 'status', status, 'serial', serial, 'student_name', student_name,
                 'halaqa_name', halaqa_name, 'center_name', center_name, 'teacher_name', teacher_name,
                 'teacher_note', teacher_note, 'decided_at', decided_at, 'created_at', created_at,
                 'verify_code', CASE WHEN status = 'approved' THEN verify_code END)
                 ORDER BY juz)
               FROM public.certificates WHERE student_id = _student), '[]'::jsonb)
  );
END;
$$;
