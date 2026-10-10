-- ════════════════════════════════════════════════════════════════════════════
-- إشعارات وليّ الأمر بصياغة تصلح للابن والبنت
-- ════════════════════════════════════════════════════════════════════════════
-- لا بيانات جنس في النظام، فعنوانا «إنجاز جديد لابنك» و«شهادة إتمام لابنك» صارا «إنجاز جديد» و«شهادة إتمام»،
-- والاسم في النص («فاطمة: إتمام حفظ الجزء 30، واعتُمدت الشهادة.»). الدالتان كما في 20260928100000_achievements.sql
-- حرفاً بحرف إلا هذه النصوص؛ CREATE OR REPLACE يحفظ الصلاحيات. يحرسها الفحصان 55 و56.
-- التراجع: إعادة تطبيق تعريفي الدالتين من 20260928100000_achievements.sql.

CREATE OR REPLACE FUNCTION public.award_badges(_student uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  streak int;
  labels text;
  n int;
  j record;
BEGIN
  IF _student IS NULL THEN RETURN 0; END IF;
  streak := (public.streak_of(_student)->>'current')::int;

  WITH pages AS (
    SELECT DISTINCT page FROM public.mushaf_records WHERE student_id = _student AND kind = 'memorize'
  ), done AS (
    SELECT u.kind, u.no FROM public.quran_units u
     WHERE (SELECT count(*) FROM pages p WHERE p.page BETWEEN u.first_page AND u.last_page)
           = u.last_page - u.first_page + 1
    UNION ALL
    SELECT 'streak', t FROM unnest(ARRAY[7, 30, 100]) t WHERE streak >= t
  ), ins AS (
    INSERT INTO public.student_badges (student_id, kind, no)
    SELECT _student, kind, no FROM done
    ON CONFLICT DO NOTHING
    RETURNING kind, no
  )
  SELECT count(*), string_agg(public.unit_label(kind, no), '، ' ORDER BY kind, no)
    INTO n, labels FROM ins;

  IF n = 0 THEN RETURN 0; END IF;

  -- طلب شهادة لكل جزء جديد، ومعلّمو الطالب يُشعَرون للاعتماد.
  FOR j IN
    SELECT b.no FROM public.student_badges b
     WHERE b.student_id = _student AND b.kind = 'juz'
       AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = _student AND c.juz = b.no)
  LOOP
    INSERT INTO public.certificates (student_id, juz, student_name, halaqa_name, center_name, teacher_name)
    SELECT _student, j.no,
           COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'طالب'),
           h.name, c.name, (SELECT name FROM public.profiles WHERE id = h.teacher_id)
      FROM (SELECT 1) x
      LEFT JOIN LATERAL (
        SELECT h.* FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
         WHERE hs.student_id = _student ORDER BY hs.created_at LIMIT 1) h ON true
      LEFT JOIN public.centers c ON c.id = h.center_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT h.teacher_id, 'certificate', 'شهادة بانتظار اعتمادك',
           COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'طالب')
             || ' أتمّ حفظ الجزء ' || j.no || '.', '/teacher'
      FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE hs.student_id = _student AND h.teacher_id IS NOT NULL;
  END LOOP;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (_student, 'achievement', 'وسام جديد', 'بارك الله فيك: ' || labels || '.', '/achievements');
  PERFORM public.notify_guardians(_student, 'achievement', 'إنجاز جديد',
    COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'أحد أبنائك') || ': ' || labels || '.');
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_certificate(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.certificates;
  me uuid := auth.uid();
BEGIN
  SELECT * INTO c FROM public.certificates WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR me IS NULL OR NOT public.teaches_student(me, c.student_id) THEN
    RAISE EXCEPTION 'لا تملك اعتماد هذه الشهادة.';
  END IF;
  IF _note IS NOT NULL AND char_length(_note) > 300 THEN
    RAISE EXCEPTION 'الملاحظة أطول من 300 حرف.';
  END IF;
  UPDATE public.certificates
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         teacher_note = NULLIF(btrim(COALESCE(_note, '')), ''),
         teacher_name = COALESCE((SELECT name FROM public.profiles WHERE id = me), teacher_name),
         decided_by = me, decided_at = now()
   WHERE id = _id;
  IF _approve THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (c.student_id, 'certificate', 'اعتُمدت شهادتك',
            'شهادة إتمام حفظ الجزء ' || c.juz || ' جاهزة للمشاركة.', '/achievements');
    PERFORM public.notify_guardians(c.student_id, 'certificate', 'شهادة إتمام',
            c.student_name || ': إتمام حفظ الجزء ' || c.juz || '، واعتُمدت الشهادة.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END);
END;
$$;
