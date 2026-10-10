-- ════════════════════════════════════════════════════════════════════
-- المراجعة المتباعدة الحقيقية (SM-2)
--
-- المشكلة: الجدولة كانت دالة واحدة ثابتة في العميل:
--   score < 60 ⇒ يوم، < 80 ⇒ يومان، < 90 ⇒ ٥ أيام، غير ذلك ⇒ ٢١ يوماً.
-- لا ذاكرة للمقطع: مقطع رُوجع عشر مرات بنجاح يُعامَل كمقطع جديد، والفواصل لا
-- تتباعد، ولا توجد قائمة «ما يجب مراجعته اليوم» — وهي جوهر تطبيق حفظ.
--
-- الحل: بطاقة مراجعة لكل مقطع (سورة + نطاق آيات) لكل طالب، بمعامل سهولة
-- وفاصل ومكرّرات تُحدَّث بخوارزمية SM-2 على الخادم.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.review_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surah_name text NOT NULL,
  from_ayah integer NOT NULL,
  to_ayah integer NOT NULL,
  -- معامل السهولة في SM-2: يبدأ من 2.5 ولا ينزل عن 1.3
  ease numeric(4, 2) NOT NULL DEFAULT 2.50,
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  last_score integer,
  last_reviewed_at timestamptz,
  due_date date NOT NULL DEFAULT (now()::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, surah_name, from_ayah, to_ayah)
);

CREATE INDEX IF NOT EXISTS review_cards_due_idx
  ON public.review_cards (student_id, due_date);

GRANT SELECT ON public.review_cards TO authenticated;
GRANT ALL ON public.review_cards TO service_role;
ALTER TABLE public.review_cards ENABLE ROW LEVEL SECURITY;

-- الطالب يقرأ بطاقاته، والمعلّم يقرأ بطاقات طلابه. الكتابة عبر الدالة فقط.
DROP POLICY IF EXISTS "read own cards or teacher" ON public.review_cards;
CREATE POLICY "read own cards or teacher" ON public.review_cards
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR (SELECT public.is_teacher((SELECT auth.uid())))
  );

CREATE TRIGGER review_cards_updated_at
  BEFORE UPDATE ON public.review_cards
  FOR EACH ROW EXECUTE FUNCTION public.progress_touch_updated_at();

-- ─────────── خوارزمية SM-2 ───────────
-- الدرجة 0..100 تُحوَّل إلى جودة 0..5 كما في SM-2:
--   q < 3  ⇒ تعثّر: تُصفَّر المكرّرات ويعود الفاصل إلى يوم واحد.
--   q >= 3 ⇒ الفاصل الجديد = الفاصل السابق × معامل السهولة.
CREATE OR REPLACE FUNCTION public.sm2_quality(_score integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _score IS NULL THEN 3
    WHEN _score >= 95 THEN 5
    WHEN _score >= 85 THEN 4
    WHEN _score >= 70 THEN 3
    WHEN _score >= 55 THEN 2
    WHEN _score >= 35 THEN 1
    ELSE 0
  END;
$$;

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

  -- يسجّل المعلّم للطالب، أو الطالب لنفسه (مراجعة ذاتية).
  IF caller <> _student_id AND NOT public.is_teacher(caller) THEN
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
    _score, now(), (now()::date + new_interval)
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

COMMENT ON FUNCTION public.apply_review IS
  'تحديث بطاقة المراجعة بخوارزمية SM-2 بعد تقييم مقطع، وإرجاع موعد المراجعة القادم.';

-- ─────────── مراجعات اليوم ───────────
CREATE OR REPLACE FUNCTION public.due_reviews(_limit integer DEFAULT 20)
RETURNS SETOF public.review_cards
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.review_cards
   WHERE student_id = auth.uid()
     AND due_date <= now()::date
   ORDER BY due_date ASC, interval_days ASC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.due_reviews(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.due_reviews(integer) TO authenticated;

-- ─────────── ترحيل البيانات القائمة ───────────
-- بناء بطاقات أولية من آخر تقييم لكل مقطع، حتى لا يبدأ الطلاب من الصفر.
INSERT INTO public.review_cards (
  student_id, surah_name, from_ayah, to_ayah,
  ease, interval_days, repetitions, last_score, last_reviewed_at, due_date
)
SELECT DISTINCT ON (a.student_id, s.surah_name, s.from_ayah, s.to_ayah)
  a.student_id,
  s.surah_name,
  s.from_ayah,
  s.to_ayah,
  2.50,
  GREATEST(1, COALESCE(a.next_review_date - a.created_at::date, 1)),
  1,
  a.score,
  a.created_at,
  COALESCE(a.next_review_date, now()::date)
FROM public.recitation_assessments a
JOIN public.recitation_sessions s ON s.id = a.session_id
WHERE a.approved
ORDER BY a.student_id, s.surah_name, s.from_ayah, s.to_ayah, a.created_at DESC
ON CONFLICT DO NOTHING;
