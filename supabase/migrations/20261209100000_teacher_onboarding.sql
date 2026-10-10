-- الإصدار 1.19.0 (المرحلة 3 من خطة التطوير): «أول يوم لك» للمعلّم الجديد، و«الوضع المبسّط» يفعّله المعلّم
-- أو إدارة مركزه، وبطاقة التحدي الجاري في رئيسية الطالب. توسيع لـ my_home_context القائمة لا دالة بديلة:
-- الرئيسية تقرأ سياقها بنداء واحد كما كانت.

-- ─────────── 1. الوضع المبسّط على مستوى المركز ───────────
-- الافتراضي لمعلّمي المركز؛ يبقى لكل معلّم أن يختار بنفسه على جهازه (src/lib/simple-mode.ts).
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS teacher_simple_mode boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_center_teacher_simple_mode(_center uuid, _on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(auth.uid(), _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.centers
     SET teacher_simple_mode = COALESCE(_on, false), updated_at = now()
   WHERE id = _center;
END;
$$;
REVOKE ALL ON FUNCTION public.set_center_teacher_simple_mode(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_center_teacher_simple_mode(uuid, boolean) TO authenticated;

-- ─────────── 2. سياق الرئيسية ───────────
-- جديد: center_simple_mode (أي مركز يدرّس فيه المعلّم أو يعمل فيه فعّله)، وsetup للمعلّم (طلاب حلقاته، وأول
-- سجل يومي، وأول رمز وليّ أمر)، وactive_challenge للطالب (أقرب تحدٍّ جارٍ في حلقاته).
CREATE OR REPLACE FUNCTION public.my_home_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  taught AS (SELECT h.id, h.center_id FROM public.halaqat h, me WHERE h.teacher_id = me.id),
  joined AS (SELECT hs.halaqa_id FROM public.halaqa_students hs, me WHERE hs.student_id = me.id)
  SELECT jsonb_build_object(
    'account_kind', (SELECT account_kind FROM public.profiles WHERE id = me.id),
    'is_teacher', public.is_teacher(me.id),
    'children', (SELECT count(*) FROM public.guardian_links WHERE guardian_id = me.id),
    'halaqas_joined', (SELECT count(*) FROM joined),
    'halaqas_taught', (SELECT count(*) FROM taught),
    'center_staff', EXISTS (SELECT 1 FROM public.center_staff WHERE user_id = me.id),
    'center_simple_mode', EXISTS (
      SELECT 1 FROM public.centers c
       WHERE c.teacher_simple_mode
         AND (c.id IN (SELECT center_id FROM taught)
              OR c.id IN (SELECT center_id FROM public.center_staff WHERE user_id = me.id))),
    'setup', CASE WHEN public.is_teacher(me.id) THEN jsonb_build_object(
      'students', (SELECT count(DISTINCT hs.student_id) FROM public.halaqa_students hs
                    WHERE hs.halaqa_id IN (SELECT id FROM taught)),
      'records', EXISTS (SELECT 1 FROM public.halaqa_daily_records r WHERE r.halaqa_id IN (SELECT id FROM taught)),
      'guardians', EXISTS (SELECT 1 FROM public.guardian_link_codes g WHERE g.created_by = me.id)
        OR EXISTS (SELECT 1 FROM public.guardian_links gl
                    JOIN public.halaqa_students hs ON hs.student_id = gl.student_id
                   WHERE hs.halaqa_id IN (SELECT id FROM taught))
    ) END,
    'active_challenge', (
      SELECT jsonb_build_object(
        'id', c.id, 'halaqa_id', c.halaqa_id, 'title', c.title, 'kind', c.kind, 'target', c.target,
        'ends_on', c.ends_on,
        'progress', CASE WHEN c.kind = 'khatma'
          THEN (SELECT count(*) FROM public.challenge_parts p WHERE p.challenge_id = c.id AND p.done_at IS NOT NULL)
          ELSE (SELECT COALESCE(sum(l.pages), 0) FROM public.challenge_logs l WHERE l.challenge_id = c.id) END)
        FROM public.halaqa_challenges c
       WHERE c.halaqa_id IN (SELECT halaqa_id FROM joined)
         AND c.completed_at IS NULL
         AND public.zen_today() BETWEEN c.starts_on AND c.ends_on
       ORDER BY c.ends_on, c.created_at
       LIMIT 1)
  )
  FROM me
  WHERE me.id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_home_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_home_context() TO authenticated;
