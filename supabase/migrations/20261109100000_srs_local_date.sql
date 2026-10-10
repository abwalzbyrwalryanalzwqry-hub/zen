-- ════════════════════════════════════════════════════════════════════
-- إصلاح 8.2 (خطة الإصلاح، المرحلة 0.6): تاريخ المراجعة المتباعدة بتوقيت التطبيق لا UTC.
--
-- كانت apply_review تحسب due_date من now()::date (UTC)، وdue_reviews تقارن به، بينما طابور اليوم
-- وسلسلة الالتزام يعتمدان zen_today() (توقيت عدن). بين منتصف الليل و03:00 بتوقيت عدن كان الكرت
-- المراجَع يبقى «مستحقاً اليوم»، وتُحسب الفواصل من يوم سابق. التعريفان أدناه مطابقان للسابقين
-- (20260922140000_teacher_halaqa_scope و20260922100000_spaced_repetition) سوى مصدر التاريخ.
-- ════════════════════════════════════════════════════════════════════

-- جدولة المراجعة: معلّم الحلقة لطالبه، أو الطالب لنفسه.
CREATE OR REPLACE FUNCTION public.apply_review(
  _student_id uuid,
  _surah_name text,
  _from_ayah integer,
  _to_ayah integer,
  _score integer
)
RETURNS TABLE (due_date date, interval_days integer, ease numeric, repetitions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  q integer := public.sm2_quality(_score);
  card public.review_cards;
  new_ease numeric(4, 2);
  new_interval integer;
  new_reps integer;
  new_lapses integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- يسجّل معلّم الحلقة لطالبه، أو الطالب لنفسه (مراجعة ذاتية).
  IF caller <> _student_id AND NOT public.teaches_student(caller, _student_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  IF _from_ayah < 1 OR _to_ayah < _from_ayah THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  SELECT * INTO card FROM public.review_cards c
   WHERE c.student_id = _student_id
     AND c.surah_name = _surah_name
     AND c.from_ayah = _from_ayah
     AND c.to_ayah = _to_ayah;

  IF card.id IS NULL THEN
    new_ease := 2.50;
    new_reps := 0;
    new_lapses := 0;
  ELSE
    new_ease := card.ease;
    new_reps := card.repetitions;
    new_lapses := card.lapses;
  END IF;

  -- تحديث معامل السهولة (صيغة SM-2 الأصلية)
  new_ease := new_ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  IF new_ease < 1.30 THEN
    new_ease := 1.30;
  END IF;
  IF new_ease > 3.00 THEN
    new_ease := 3.00;
  END IF;

  IF q < 3 THEN
    new_reps := 0;
    new_lapses := new_lapses + 1;
    new_interval := 1;
  ELSE
    new_reps := new_reps + 1;
    new_interval := CASE
      WHEN new_reps = 1 THEN 1
      WHEN new_reps = 2 THEN 4
      ELSE GREATEST(1, ROUND(COALESCE(card.interval_days, 1) * new_ease))::integer
    END;
    -- سقف عملي: لا يتجاوز الفاصل سنة حتى لا يُنسى المقطع فعلياً.
    new_interval := LEAST(new_interval, 365);
  END IF;

  INSERT INTO public.review_cards AS rc (
    student_id, surah_name, from_ayah, to_ayah,
    ease, interval_days, repetitions, lapses,
    last_score, last_reviewed_at, due_date
  )
  VALUES (
    _student_id, _surah_name, _from_ayah, _to_ayah,
    new_ease, new_interval, new_reps, new_lapses,
    _score, now(), (public.zen_today() + new_interval)
  )
  ON CONFLICT (student_id, surah_name, from_ayah, to_ayah) DO UPDATE
    SET ease = EXCLUDED.ease,
        interval_days = EXCLUDED.interval_days,
        repetitions = EXCLUDED.repetitions,
        lapses = EXCLUDED.lapses,
        last_score = EXCLUDED.last_score,
        last_reviewed_at = EXCLUDED.last_reviewed_at,
        due_date = EXCLUDED.due_date;

  RETURN QUERY
    SELECT c.due_date, c.interval_days, c.ease, c.repetitions
      FROM public.review_cards c
     WHERE c.student_id = _student_id
       AND c.surah_name = _surah_name
       AND c.from_ayah = _from_ayah
       AND c.to_ayah = _to_ayah;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_review(uuid, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_review(uuid, text, integer, integer, integer) TO authenticated;


-- ─────────── مراجعات اليوم ───────────
CREATE OR REPLACE FUNCTION public.due_reviews(_limit integer DEFAULT 20)
RETURNS SETOF public.review_cards
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.review_cards
   WHERE student_id = (SELECT auth.uid())
     AND due_date <= public.zen_today()
   ORDER BY due_date ASC, interval_days ASC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.due_reviews(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.due_reviews(integer) TO authenticated;
ALTER TABLE public.review_cards ALTER COLUMN due_date SET DEFAULT public.zen_today();
