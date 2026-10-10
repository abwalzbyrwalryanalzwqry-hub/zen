-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.2 — الحضور برمز QR
-- ════════════════════════════════════════════════════════════════════════════
-- المعلّم يعرض رمزاً يتجدّد كل 30 ثانية؛ الطالب يمسحه (أو يكتب أرقامه الستة) فيُسجَّل حاضراً.
--   issue_attendance_code(_halaqa)  لمدير الحلقة: رمز جديد عشوائي صالح 30 ثانية.
--   check_in(_code)                 للطالب: مرة واحدة يومياً لكل حلقة، ومن طلابها فقط.
-- تخمين الأرقام: 5 محاولات في الدقيقة لكل طالب (attendance_checkin_attempts).
-- الحالات: checked_in | already | invalid (منتهٍ أو خاطئ أو لحلقة أخرى، بلا تمييز)، و TOO_MANY_ATTEMPTS استثناء.

CREATE TABLE IF NOT EXISTS public.attendance_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  issued_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_codes_active_idx ON public.attendance_codes (code, expires_at);
CREATE INDEX IF NOT EXISTS attendance_codes_halaqa_idx ON public.attendance_codes (halaqa_id, created_at DESC);
ALTER TABLE public.attendance_codes ENABLE ROW LEVEL SECURITY;
-- لا قراءة ولا كتابة مباشرة: الرموز تمرّ بالدالتين فقط.
REVOKE ALL ON public.attendance_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.attendance_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.attendance_checkin_attempts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_checkin_attempts_idx ON public.attendance_checkin_attempts (user_id, at DESC);
ALTER TABLE public.attendance_checkin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_checkin_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.attendance_checkin_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.issue_attendance_code(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  c text;
  exp timestamptz := now() + interval '30 seconds';
BEGIN
  IF caller IS NULL OR NOT private.manages_halaqa(caller, _halaqa) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  -- رقم عشوائي تشفيري من 6 خانات (لا random()).
  c := lpad((abs(('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  INSERT INTO public.attendance_codes (halaqa_id, code, issued_by, expires_at) VALUES (_halaqa, c, caller, exp);
  -- تنظيف ما انتهى منذ يوم.
  DELETE FROM public.attendance_codes WHERE expires_at < now() - interval '1 day';
  RETURN jsonb_build_object('code', c, 'expires_at', exp, 'halaqa_id', _halaqa);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_attendance_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_attendance_code(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_in(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h uuid;
  hname text;
  d date := public.zen_today();
  existing text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF (SELECT count(*) FROM public.attendance_checkin_attempts
       WHERE user_id = caller AND at > now() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
  END IF;
  INSERT INTO public.attendance_checkin_attempts (user_id) VALUES (caller);
  DELETE FROM public.attendance_checkin_attempts WHERE user_id = caller AND at < now() - interval '1 day';

  -- الرمز الخاطئ يُعاد حالةً لا استثناءً، كي تبقى المحاولة مسجّلة (الاستثناء يلغي الإدراج أعلاه).
  IF _code IS NULL OR _code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- رمز ساري لحلقة الطالب نفسه (رمز حلقة أخرى لا يفيده).
  SELECT ac.halaqa_id, hq.name INTO h, hname
    FROM public.attendance_codes ac
    JOIN public.halaqat hq ON hq.id = ac.halaqa_id
   WHERE ac.code = _code AND ac.expires_at > now()
     AND EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = ac.halaqa_id AND hs.student_id = caller)
   ORDER BY ac.created_at DESC LIMIT 1;
  IF h IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT status INTO existing FROM public.attendance
   WHERE student_id = caller AND halaqa_id = h AND session_date = d;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already', 'attendance', existing, 'halaqa', hname);
  END IF;

  INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status, reason)
  SELECT caller, h, hq.teacher_id, d, 'present', 'qr' FROM public.halaqat hq WHERE hq.id = h;
  RETURN jsonb_build_object('status', 'checked_in', 'attendance', 'present', 'halaqa', hname);
END;
$$;
REVOKE ALL ON FUNCTION public.check_in(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in(text) TO authenticated, service_role;
