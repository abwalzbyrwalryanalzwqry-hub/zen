-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 8.2 — طابور اليوم الموحّد
-- ════════════════════════════════════════════════════════════════════════════
-- بند واحد لكل ما على الطالب اليوم، مع زمن تقديري بالدقائق:
--   assignment  واجب مفتوح (pending/redo)، ويظهر منجزاً إن تغيّرت حالته اليوم.
--   review      كرت SM-2 مستحق، ويظهر منجزاً إن رُوجع اليوم.
--   exam_error  موضع خطأ من آخر اختبار لم يُرسل إلى المراجعة.
--   wird        ورد اليوم، منجز إن سُجّل في daily_wird.
-- لا حساب هنا لجدولة SM-2 (القاعدة 4): الطابور يقرأ فقط.
--   my_today_queue()                 للطالب نفسه.
--   guardian_today_queue(_student)   قراءة لولي أمره المربوط.

CREATE OR REPLACE FUNCTION public.today_queue_for(_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (SELECT public.zen_today() AS d),
  items AS (
    SELECT 'assignment'::text AS kind, a.id::text AS id, a.surah_name, a.from_ayah, a.to_ayah,
           a.kind AS sub, a.due_date,
           a.status NOT IN ('pending', 'redo') AS done,
           CASE WHEN a.kind = 'memorize' THEN greatest(3, (a.to_ayah - a.from_ayah + 1) * 2)
                ELSE greatest(2, a.to_ayah - a.from_ayah + 1) END AS minutes,
           NULL::uuid AS result_id, NULL::integer AS surah_number, 1 AS prio
      FROM public.assignments a, today
     WHERE a.student_id = _uid
       AND (a.status IN ('pending', 'redo')
            OR (a.updated_at AT TIME ZONE 'Asia/Aden')::date = today.d)
    UNION ALL
    SELECT 'review', c.id::text, c.surah_name, c.from_ayah, c.to_ayah, NULL, c.due_date,
           coalesce((c.last_reviewed_at AT TIME ZONE 'Asia/Aden')::date = today.d, false),
           greatest(2, ceil((c.to_ayah - c.from_ayah + 1) * 0.5)::integer),
           NULL, NULL, 2
      FROM public.review_cards c, today
     WHERE c.student_id = _uid
       AND (c.due_date <= today.d
            OR (c.last_reviewed_at AT TIME ZONE 'Asia/Aden')::date = today.d)
    UNION ALL
    SELECT 'exam_error', e.id::text, e.surah_name, e.from_ayah, e.to_ayah, NULL, NULL,
           false, greatest(2, e.to_ayah - e.from_ayah + 1), e.result_id, e.surah_number, 3
      FROM public.exam_errors e
     WHERE e.student_id = _uid AND NOT e.sent_to_review
       AND e.result_id = (SELECT r.id FROM public.exam_results r WHERE r.student_id = _uid
                           ORDER BY r.created_at DESC LIMIT 1)
    UNION ALL
    SELECT 'wird', 'wird', NULL, NULL, NULL, NULL, today.d,
           EXISTS (SELECT 1 FROM public.daily_wird w WHERE w.student_id = _uid AND w.day = today.d),
           15, NULL, NULL, 4
      FROM today
  ),
  ranked AS (
    SELECT * FROM items ORDER BY done, prio, due_date NULLS LAST, surah_name, from_ayah LIMIT 40
  )
  SELECT jsonb_build_object(
    'day', (SELECT d FROM today),
    'total_minutes', coalesce((SELECT sum(minutes) FILTER (WHERE NOT done) FROM ranked), 0),
    'done', (SELECT count(*) FILTER (WHERE done) FROM ranked),
    'items', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'kind', kind, 'id', id, 'surah_name', surah_name, 'surah_number', surah_number,
        'from_ayah', from_ayah, 'to_ayah', to_ayah, 'sub', sub, 'due_date', due_date,
        'done', done, 'minutes', minutes, 'result_id', result_id))) FROM ranked), '[]'::jsonb)
  );
$$;
-- داخلية: تنادى من الدالتين أدناه فقط.
REVOKE ALL ON FUNCTION public.today_queue_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.today_queue_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.my_today_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  RETURN public.today_queue_for((SELECT auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION public.my_today_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_today_queue() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guardian_today_queue(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_guardian_of((SELECT auth.uid()), _student) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  RETURN public.today_queue_for(_student);
END;
$$;
REVOKE ALL ON FUNCTION public.guardian_today_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_today_queue(uuid) TO authenticated, service_role;
